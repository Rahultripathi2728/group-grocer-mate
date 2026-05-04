
-- =========================================
-- 1. PROFILES: drop email, restrict upi_id
-- =========================================

-- Update trigger to no longer write email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$function$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Revoke direct upi_id read from authenticated; only self can read via column
REVOKE SELECT (upi_id) ON public.profiles FROM authenticated, anon;

-- Self can still read/update their own upi_id via dedicated grants
GRANT SELECT (upi_id), UPDATE (upi_id) ON public.profiles TO authenticated;
-- ^ Note: column GRANT to authenticated is restricted by RLS to own row

-- Wait — granting SELECT(upi_id) back to authenticated re-exposes it for any row the RLS allows.
-- Instead, revoke and use RPC for cross-user lookups, plus an RPC for self read.
REVOKE SELECT (upi_id) ON public.profiles FROM authenticated, anon;

-- RPC for self UPI read
CREATE OR REPLACE FUNCTION public.get_my_upi()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT upi_id FROM public.profiles WHERE id = auth.uid();
$$;

-- RPC for group co-member UPI lookup (for settlements only)
CREATE OR REPLACE FUNCTION public.get_member_upi(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result text;
BEGIN
  -- Allow if same user OR shares any group with caller
  IF p_user_id = auth.uid() THEN
    SELECT upi_id INTO result FROM public.profiles WHERE id = p_user_id;
    RETURN result;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_memberships gm1
    JOIN public.group_memberships gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid() AND gm2.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.groups g
    JOIN public.group_memberships gm ON gm.group_id = g.id
    WHERE (g.owner_id = auth.uid() AND gm.user_id = p_user_id)
       OR (gm.user_id = auth.uid() AND g.owner_id = p_user_id)
  ) THEN
    SELECT upi_id INTO result FROM public.profiles WHERE id = p_user_id;
    RETURN result;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_upi() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_upi(uuid) TO authenticated;

-- =========================================
-- 2. GROUPS: restrict invite_code to admins
-- =========================================

REVOKE SELECT (invite_code) ON public.groups FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_group_invite_code(p_group_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  code text;
BEGIN
  IF NOT public.is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'Only group admins can view the invite code';
  END IF;
  SELECT invite_code INTO code FROM public.groups WHERE id = p_group_id;
  RETURN code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_invite_code(uuid) TO authenticated;

-- =========================================
-- 3. VAPID KEYS: remove private key column, add explicit deny
-- =========================================

ALTER TABLE public.vapid_keys DROP COLUMN IF EXISTS private_key;

-- Explicit deny policies (RLS already enabled; service_role bypasses RLS)
CREATE POLICY "Deny all access to vapid_keys"
ON public.vapid_keys
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- =========================================
-- 4. SECURE PUSH TRIGGER: use service role key from vault
-- =========================================

-- Store the service role key in vault if not present (user must set this secret separately if needed)
-- We'll read from current_setting which can be set via ALTER DATABASE, OR fall back to vault.

CREATE OR REPLACE FUNCTION public.send_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  service_key TEXT;
  supabase_url TEXT := 'https://lrgasohwcydvvibseyym.supabase.co';
BEGIN
  -- Try to read the service role key from vault
  BEGIN
    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_key := NULL;
  END;

  IF service_key IS NULL THEN
    -- No key configured; skip push silently rather than expose a bypass
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
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
