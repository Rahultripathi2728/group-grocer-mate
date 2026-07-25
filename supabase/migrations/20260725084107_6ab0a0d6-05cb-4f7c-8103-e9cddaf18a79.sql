-- 1) Notifications: restrict INSERT to service_role only
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Only service role can insert notifications"
  ON public.notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 2) Profiles: allow SELECT to accepted friends as well
DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.profiles;
CREATE POLICY "Users can view relevant profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.group_memberships gm1
      JOIN public.group_memberships gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid() AND gm2.user_id = profiles.id
    )
    OR EXISTS (
      SELECT 1 FROM public.groups g
      JOIN public.group_memberships gm ON gm.group_id = g.id
      WHERE (g.owner_id = auth.uid() AND gm.user_id = profiles.id)
         OR (gm.user_id = auth.uid() AND g.owner_id = profiles.id)
    )
    OR public.are_friends(auth.uid(), profiles.id)
  );

-- 3) get_member_upi: also allow accepted friends
CREATE OR REPLACE FUNCTION public.get_member_upi(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result text;
BEGIN
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
  ) OR public.are_friends(auth.uid(), p_user_id) THEN
    SELECT upi_id INTO result FROM public.profiles WHERE id = p_user_id;
    RETURN result;
  END IF;

  RETURN NULL;
END;
$function$;