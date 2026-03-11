
-- Drop the two restrictive UPDATE policies on expenses
DROP POLICY "Users can update own expenses" ON public.expenses;
DROP POLICY "Group admins can update group expenses" ON public.expenses;

-- Recreate as PERMISSIVE policies (OR logic - either condition allows update)
CREATE POLICY "Users can update own expenses"
ON public.expenses FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group admins can update group expenses"
ON public.expenses FOR UPDATE TO authenticated
USING (group_id IS NOT NULL AND is_group_admin(group_id))
WITH CHECK (group_id IS NOT NULL AND is_group_admin(group_id));
