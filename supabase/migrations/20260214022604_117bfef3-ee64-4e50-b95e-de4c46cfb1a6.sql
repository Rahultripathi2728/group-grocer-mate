-- Allow group members to update group expenses (needed for settlement)
DROP POLICY IF EXISTS "Users can update own expenses" ON public.expenses;

CREATE POLICY "Users can update own or group expenses"
ON public.expenses
FOR UPDATE
USING (
  (user_id = auth.uid()) OR 
  (group_id IS NOT NULL AND is_group_member(group_id))
);