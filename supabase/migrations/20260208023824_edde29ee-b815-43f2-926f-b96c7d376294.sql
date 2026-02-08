
-- Drop the restrictive policy that blocks group members from seeing each other
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Drop the permissive policy we just added (we'll combine them)
DROP POLICY IF EXISTS "Group members can view each others profiles" ON public.profiles;

-- Create a single permissive policy that allows viewing own profile OR group members' profiles
CREATE POLICY "Users can view relevant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm1
    JOIN public.group_memberships gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid() AND gm2.user_id = profiles.id
  )
  OR EXISTS (
    SELECT 1 FROM public.groups g
    JOIN public.group_memberships gm ON gm.group_id = g.id
    WHERE (g.owner_id = auth.uid() AND gm.user_id = profiles.id)
       OR (gm.user_id = auth.uid() AND g.owner_id = profiles.id)
  )
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.owner_id = auth.uid() AND g.owner_id = profiles.id
  )
);
