import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ---- Base64url helpers ----

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

// ---- VAPID JWT ----

async function createVapidJwt(audience: string, subject: string, privateKeyData: { d: string; x: string; y: string }): Promise<string> {
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

  // Convert DER signature to raw r||s (64 bytes) if needed
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

// ---- HKDF (extract + expand) ----

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // Extract
  const saltKey = await crypto.subtle.importKey(
    "raw", salt.length ? salt : new Uint8Array(32),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));

  // Expand
  const prkKey = await crypto.subtle.importKey(
    "raw", prk,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));

  return okm.slice(0, length);
}

// ---- Web Push Encryption (aes128gcm, RFC 8291 + RFC 8188) ----

async function encryptPayload(
  plaintext: Uint8Array,
  clientPublicKeyBytes: Uint8Array,
  authSecret: Uint8Array
): Promise<{ body: Uint8Array; localPublicKey: Uint8Array }> {
  // 1. Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  // 2. Import client (subscriber) public key
  const clientPublicKey = await crypto.subtle.importKey(
    "raw", clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false, []
  );

  // 3. ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      localKeyPair.privateKey,
      256
    )
  );

  // 4. Derive IKM using auth secret (RFC 8291 Section 3.3)
  // info = "WebPush: info\0" + ua_public(65) + as_public(65)
  const webPushInfo = new Uint8Array(
    "WebPush: info\0".length + clientPublicKeyBytes.length + localPublicKeyRaw.length
  );
  const enc = new TextEncoder();
  webPushInfo.set(enc.encode("WebPush: info\0"), 0);
  webPushInfo.set(clientPublicKeyBytes, 14);
  webPushInfo.set(localPublicKeyRaw, 14 + clientPublicKeyBytes.length);

  const ikm = await hkdf(authSecret, sharedSecret, webPushInfo, 32);

  // 5. Generate 16-byte random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 6. Derive CEK and nonce (RFC 8188)
  const cekInfo = enc.encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = enc.encode("Content-Encoding: nonce\0");

  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // 7. Pad plaintext: append delimiter byte 0x02 (last record)
  const paddedPlaintext = new Uint8Array(plaintext.length + 1);
  paddedPlaintext.set(plaintext);
  paddedPlaintext[plaintext.length] = 0x02; // last record delimiter

  // 8. AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      paddedPlaintext
    )
  );

  // 9. Build aes128gcm body: header + ciphertext
  // header = salt(16) + rs(4) + idlen(1) + keyid(65)
  const rs = 4096;
  const headerSize = 16 + 4 + 1 + localPublicKeyRaw.length;
  const body = new Uint8Array(headerSize + ciphertext.length);

  body.set(salt, 0);
  body[16] = (rs >> 24) & 0xff;
  body[17] = (rs >> 16) & 0xff;
  body[18] = (rs >> 8) & 0xff;
  body[19] = rs & 0xff;
  body[20] = localPublicKeyRaw.length;
  body.set(localPublicKeyRaw, 21);
  body.set(ciphertext, headerSize);

  return { body, localPublicKey: localPublicKeyRaw };
}

// ---- Send Web Push ----

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  vapidPublicKey: string,
  privateKeyData: { d: string; x: string; y: string },
  payload: { title: string; body: string; type?: string }
) {
  const vapidSubject = "mailto:push@expensetrack.app";
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.hostname}`;

  const jwt = await createVapidJwt(audience, vapidSubject, privateKeyData);

  // Encode payload to bytes
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const clientPublicKey = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);

  // Encrypt using aes128gcm
  const { body } = await encryptPayload(payloadBytes, clientPublicKey, authSecret);

  console.log(`Sending push to ${subscription.endpoint.substring(0, 60)}... payload size: ${payloadBytes.length}, encrypted body size: ${body.length}`);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
    },
    body: body,
  });

  const responseText = await response.text();
  console.log(`Push response: ${response.status} ${responseText}`);

  return response;
}

// ---- Main handler ----

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedInternalSecret = Deno.env.get('INTERNAL_PUSH_SECRET');
    const isInternalTrigger = !!(internalSecret && expectedInternalSecret && internalSecret === expectedInternalSecret);

    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = token === serviceRoleKey;

    let callerId: string | null = null;

    if (!isServiceRole && !isInternalTrigger) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      callerId = user.id;
    }

    const { user_id, title, message, type } = await req.json();
    const targetUserId = user_id || callerId;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!isServiceRole && !isInternalTrigger && targetUserId !== callerId) {
      const { data: callerGroups } = await supabase
        .from('group_memberships')
        .select('group_id')
        .eq('user_id', callerId);
      const { data: callerOwnedGroups } = await supabase
        .from('groups')
        .select('id')
        .eq('owner_id', callerId);

      const callerGroupIds = [
        ...(callerGroups || []).map(g => g.group_id),
        ...(callerOwnedGroups || []).map(g => g.id)
      ];

      if (callerGroupIds.length === 0) {
        return new Response(JSON.stringify({ error: 'Forbidden: no shared group' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: targetInGroup } = await supabase
        .from('group_memberships')
        .select('id')
        .eq('user_id', targetUserId)
        .in('group_id', callerGroupIds)
        .limit(1);
      const { data: targetOwnsGroup } = await supabase
        .from('groups')
        .select('id')
        .eq('owner_id', targetUserId)
        .in('id', callerGroupIds)
        .limit(1);

      if ((!targetInGroup || targetInGroup.length === 0) && (!targetOwnsGroup || targetOwnsGroup.length === 0)) {
        return new Response(JSON.stringify({ error: 'Forbidden: no shared group with target user' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const { data: vapidRow } = await supabase
      .from('vapid_keys')
      .select('public_key')
      .limit(1)
      .single();

    const privateKeyJwk = Deno.env.get('VAPID_PRIVATE_KEY_JWK');

    if (!vapidRow || !privateKeyJwk) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const privateKeyData = JSON.parse(privateKeyJwk);

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", targetUserId);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No push subscriptions found" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const pushPayload = {
      title: title || "Expense Manager",
      body: message || "You have a new notification",
      type: type || "general",
    };

    console.log(`Sending push to ${subscriptions.length} subscription(s): ${JSON.stringify(pushPayload)}`);

    const results = [];
    for (const sub of subscriptions) {
      try {
        const res = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          vapidRow.public_key,
          privateKeyData,
          pushPayload
        );
        results.push({ endpoint: sub.endpoint, status: res.status });

        if (res.status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      } catch (e) {
        console.error(`Push error for ${sub.endpoint}: ${e.message}`);
        results.push({ endpoint: sub.endpoint, error: e.message });
      }
    }

    return new Response(JSON.stringify({ sent: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Internal error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
