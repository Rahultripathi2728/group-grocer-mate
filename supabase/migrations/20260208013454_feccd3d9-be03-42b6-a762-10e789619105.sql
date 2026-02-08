-- Drop the policy we just added (it won't work with restrictive existing policy)
DROP POLICY IF EXISTS "Users can find groups by invite code" ON public.groups;

-- Create a security definer function to look up group by invite code
-- This bypasses RLS safely, returning only the group ID
CREATE OR REPLACE FUNCTION public.get_group_id_by_invite_code(p_invite_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.groups WHERE invite_code = p_invite_code LIMIT 1;
$$;