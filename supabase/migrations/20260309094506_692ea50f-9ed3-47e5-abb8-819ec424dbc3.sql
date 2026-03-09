
-- Update the trigger function to use anon key for authentication
CREATE OR REPLACE FUNCTION public.send_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZ2Fzb2h3Y3lkdnZpYnNleXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMjA5MDksImV4cCI6MjA4NDc5NjkwOX0.GwDfsiRS1GQ1jZhd5d4NEZ7ftstdxZ2R_XU9VQIO9j8';
  supabase_url TEXT := 'https://lrgasohwcydvvibseyym.supabase.co';
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key,
      'x-internal-trigger', 'true'
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
$$;
