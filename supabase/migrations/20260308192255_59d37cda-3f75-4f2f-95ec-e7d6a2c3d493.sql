-- Fix expenses UPDATE policy: restrict to owner only (admins handled separately)
DROP POLICY IF EXISTS "Users can update own or group expenses" ON public.expenses;

CREATE POLICY "Users can update own expenses"
ON public.expenses
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow group admins to update group expenses separately
CREATE POLICY "Group admins can update group expenses"
ON public.expenses
FOR UPDATE
TO authenticated
USING (group_id IS NOT NULL AND is_group_admin(group_id))
WITH CHECK (group_id IS NOT NULL AND is_group_admin(group_id));