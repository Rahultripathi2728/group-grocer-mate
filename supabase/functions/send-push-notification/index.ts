import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

// ---- Web Push Payload Encryption (RFC 8291 + RFC 8188) ----

async function hkdfExpand(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  
  // Extract
  const saltKey = await crypto.subtle.importKey("raw", salt.length ? salt : new Uint8Array(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));
  
  // Expand
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  
  return okm.slice(0, length);
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const encoder = new TextEncoder();
  const contentEncoding = encoder.encode("Content-Encoding: ");
  const pLabel = encoder.encode("\0P-256\0");
  
  // "Content-Encoding: <type>\0P-256\0" + len(client) + client + len(server) + server
  const info = new Uint8Array(
    contentEncoding.length + typeBytes.length + pLabel.length + 
    2 + clientPublicKey.length + 2 + serverPublicKey.length
  );
  
  let offset = 0;
  info.set(contentEncoding, offset); offset += contentEncoding.length;
  info.set(typeBytes, offset); offset += typeBytes.length;
  info.set(pLabel, offset); offset += pLabel.length;
  
  info[offset++] = 0;
  info[offset++] = clientPublicKey.length;
  info.set(clientPublicKey, offset); offset += clientPublicKey.length;
  
  info[offset++] = 0;
  info[offset++] = serverPublicKey.length;
  info.set(serverPublicKey, offset);
  
  return info;
}

async function encryptPayload(
  plaintext: Uint8Array,
  clientPublicKeyBytes: Uint8Array,
  authSecret: Uint8Array
): Promise<{ ciphertext: Uint8Array; localPublicKey: Uint8Array }> {
  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  
  // Export local public key (uncompressed)
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));
  
  // Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  
  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      localKeyPair.privateKey,
      256
    )
  );
  
  // RFC 8291: IKM from auth secret
  const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
  const ikm = await hkdfExpand(sharedSecret, authSecret, authInfo, 32);
  
  // Generate 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive content encryption key and nonce
  const cekInfo = createInfo("aesgcm", clientPublicKeyBytes, localPublicKeyRaw);
  const nonceInfo = createInfo("nonce", clientPublicKeyBytes, localPublicKeyRaw);
  
  const cek = await hkdfExpand(ikm, salt, cekInfo, 16);
  const nonce = await hkdfExpand(ikm, salt, nonceInfo, 12);
  
  // Add 2-byte padding (0x00 0x00 = no padding)
  const paddedPlaintext = new Uint8Array(2 + plaintext.length);
  paddedPlaintext[0] = 0;
  paddedPlaintext[1] = 0;
  paddedPlaintext.set(plaintext, 2);
  
  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      paddedPlaintext
    )
  );
  
  // Build final body: salt(16) + rs(4) + keyidlen(1) + keyid(65) + encrypted
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length);
  header.set(salt, 0);
  header[16] = (rs >> 24) & 0xff;
  header[17] = (rs >> 16) & 0xff;
  header[18] = (rs >> 8) & 0xff;
  header[19] = rs & 0xff;
  header[20] = localPublicKeyRaw.length;
  header.set(localPublicKeyRaw, 21);
  
  // For aesgcm encoding, body is just the encrypted content
  // Headers carry salt and keyid
  
  return { 
    ciphertext: encrypted, 
    localPublicKey: localPublicKeyRaw,
    salt 
  } as any;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  vapidPublicKey: string,
  privateKeyData: { d: string; x: string; y: string },
  payload: { title: string; body: string; type?: string }
) {
  const vapidSubject = "mailto:push@expensetrack.app";
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.hostname}`;

  const jwt = await createJwt(audience, vapidSubject, privateKeyData);
  
  // Encode payload
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const clientPublicKey = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  
  // Encrypt using Web Push encryption (aesgcm)
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));
  
  const clientKey = await crypto.subtle.importKey(
    "raw", clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false, []
  );
  
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      localKeyPair.privateKey,
      256
    )
  );
  
  // HKDF for auth
  const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
  const ikm = await hkdfExpand(sharedSecret, authSecret, authInfo, 32);
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const cekInfo = createInfo("aesgcm", clientPublicKey, localPublicKeyRaw);
  const nonceInfo = createInfo("nonce", clientPublicKey, localPublicKeyRaw);
  
  const cek = await hkdfExpand(ikm, salt, cekInfo, 16);
  const nonce = await hkdfExpand(ikm, salt, nonceInfo, 12);
  
  // Pad plaintext (2-byte padding header)
  const paddedPayload = new Uint8Array(2 + payloadBytes.length);
  paddedPayload[0] = 0;
  paddedPayload[1] = 0;
  paddedPayload.set(payloadBytes, 2);
  
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      paddedPayload
    )
  );

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aesgcm",
      "Encryption": `salt=${base64UrlEncode(salt.buffer)}`,
      "Crypto-Key": `dh=${base64UrlEncode(localPublicKeyRaw.buffer)};p256ecdsa=${vapidPublicKey}`,
      "TTL": "86400",
    },
    body: encrypted,
  });

  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const isInternalTrigger = req.headers.get('x-internal-trigger') === 'true';

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
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      callerId = claimsData.claims.sub;
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

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", targetUserId);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No push subscriptions found" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build the push payload with actual notification content
    const pushPayload = {
      title: title || "Expense Manager",
      body: message || "You have a new notification",
      type: type || "general",
    };

    const results = [];
    for (const sub of subscriptions) {
      try {
        const res = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          vapidKeys.public_key,
          privateKeyData,
          pushPayload
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
    console.error('Internal error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
