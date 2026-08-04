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
  v_url TEXT;
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

  IF NEW.type LIKE 'expense%' THEN
    v_url := 'calendar'
      || CASE WHEN NEW.expense_date IS NOT NULL THEN '?date=' || NEW.expense_date::text ELSE '' END
      || CASE WHEN NEW.expense_date IS NOT NULL AND NEW.expense_id IS NOT NULL
              THEN '&expense=' || NEW.expense_id::text ELSE '' END;
  ELSIF NEW.type = 'settlement' THEN
    v_url := 'settlement'
      || CASE WHEN NEW.group_id IS NOT NULL THEN '?group=' || NEW.group_id::text ELSE '' END;
  ELSE
    v_url := 'notifications';
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
      'type', NEW.type,
      'url', v_url
    )
  );

  RETURN NEW;
END;
$function$;