
-- Store the internal trigger secret in vault
SELECT vault.create_secret(
  'c3f8d08869abb4c56f8fd1a2ab5587fe6353c4d93d948e85325942735bd1fc3d',
  'internal_push_secret',
  'Shared secret used by send_push_on_notification trigger to authenticate to send-push-notification edge function'
);

-- Update trigger to use the vault secret instead of x-internal-trigger header
CREATE OR REPLACE FUNCTION public.send_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  internal_secret TEXT;
  anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZ2Fzb2h3Y3lkdnZpYnNleXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMjA5MDksImV4cCI6MjA4NDc5NjkwOX0.GwDfsiRS1GQ1jZhd5d4NEZ7ftstdxZ2R_XU9VQIO9j8';
  supabase_url TEXT := 'https://lrgasohwcydvvibseyym.supabase.co';
BEGIN
  BEGIN
    SELECT decrypted_secret INTO internal_secret
    FROM vault.decrypted_secrets
    WHERE name = 'internal_push_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    internal_secret := NULL;
  END;

  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'type', NEW.type
    )
  );

  RETURN NEW;
END;
$function$;
