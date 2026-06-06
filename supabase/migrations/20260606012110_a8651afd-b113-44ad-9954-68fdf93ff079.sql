
-- Rotate the internal push secret to a freshly generated random value (not stored in source code)
DO $$
DECLARE
  v_id uuid;
  v_new text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'internal_push_secret' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_new, 'internal_push_secret', 'Internal secret used by send_push_on_notification trigger');
  ELSE
    PERFORM vault.update_secret(v_id, v_new);
  END IF;
END $$;

-- RPC accessible only to service_role so the edge function can fetch the secret without exposing vault to clients
CREATE OR REPLACE FUNCTION public.get_internal_push_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_push_secret'
  LIMIT 1;
  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.get_internal_push_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_push_secret() TO service_role;
