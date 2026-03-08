import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getOrCreateVapidKeys(supabase: any) {
  // Check if keys exist
  const { data: existing } = await supabase
    .from('vapid_keys')
    .select('*')
    .limit(1)
    .single();

  if (existing) return existing;

  // Generate new VAPID keys
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyRaw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  // Store d (private), x, y for full key reconstruction
  const privateKey = JSON.stringify({
    d: privateKeyJwk.d,
    x: publicKeyJwk.x,
    y: publicKeyJwk.y,
  });

  const { data: inserted, error } = await supabase
    .from('vapid_keys')
    .insert({ public_key: publicKeyBase64, private_key: privateKey })
    .select()
    .single();

  if (error) throw error;
  return inserted;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const keys = await getOrCreateVapidKeys(supabase);

    return new Response(JSON.stringify({ publicKey: keys.public_key }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
