import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function createJwt(audience: string, subject: string, privateKeyData: { d: string; x: string; y: string }): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: subject };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: privateKeyData.d, x: privateKeyData.x, y: privateKeyData.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const sigBytes = new Uint8Array(signature);
  if (sigBytes.length === 64) {
    return `${unsignedToken}.${base64UrlEncode(signature)}`;
  }

  // DER to raw conversion
  let offset = 2;
  const rLen = sigBytes[offset + 1];
  offset += 2;
  let r = sigBytes.slice(offset, offset + rLen);
  offset += rLen;
  const sLen = sigBytes[offset + 1];
  offset += 2;
  let s = sigBytes.slice(offset, offset + sLen);

  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);
  if (r.length < 32) { const tmp = new Uint8Array(32); tmp.set(r, 32 - r.length); r = tmp; }
  if (s.length < 32) { const tmp = new Uint8Array(32); tmp.set(s, 32 - s.length); s = tmp; }

  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  return `${unsignedToken}.${base64UrlEncode(rawSig.buffer)}`;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  vapidPublicKey: string,
  privateKeyData: { d: string; x: string; y: string }
) {
  const vapidSubject = "mailto:push@expensetrack.app";
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.hostname}`;

  const jwt = await createJwt(audience, vapidSubject, privateKeyData);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": "0",
      "TTL": "86400",
    },
  });

  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, title, message, type } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get VAPID keys from database
    const { data: vapidKeys } = await supabase
      .from('vapid_keys')
      .select('*')
      .limit(1)
      .single();

    if (!vapidKeys) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const privateKeyData = JSON.parse(vapidKeys.private_key);

    // Get user's push subscriptions
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No push subscriptions found" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = [];
    for (const sub of subscriptions) {
      try {
        const res = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          vapidKeys.public_key,
          privateKeyData
        );
        results.push({ endpoint: sub.endpoint, status: res.status });

        if (res.status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      } catch (e) {
        results.push({ endpoint: sub.endpoint, error: e.message });
      }
    }

    return new Response(JSON.stringify({ sent: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
