CREATE OR REPLACE FUNCTION public.user_has_expense_split(_expense_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_splits s
    WHERE s.expense_id = _expense_id
      AND s.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_expense_record(_expense_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id = _expense_id
      AND (
        e.user_id = _user_id
        OR (e.group_id IS NOT NULL AND public.is_group_member(e.group_id))
        OR (e.expense_type = 'shared' AND public.user_has_expense_split(e.id, _user_id))
      )
  );
$$;

DROP POLICY IF EXISTS "Users can view own, group or shared expenses" ON public.expenses;
CREATE POLICY "Users can view own, group or shared expenses"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (group_id IS NOT NULL AND public.is_group_member(group_id))
  OR (expense_type = 'shared' AND public.user_has_expense_split(id, auth.uid()))
);

DROP POLICY IF EXISTS "Users can view splits for their expenses" ON public.expense_splits;
CREATE POLICY "Users can view splits for accessible expenses"
ON public.expense_splits
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_access_expense_record(expense_id, auth.uid())
);

DROP POLICY IF EXISTS "Expense owners can manage splits" ON public.expense_splits;
CREATE POLICY "Expense owners can manage splits"
ON public.expense_splits
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id = expense_splits.expense_id
      AND e.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update their own splits" ON public.expense_splits;
CREATE POLICY "Users can update their own splits"
ON public.expense_splits
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id = expense_splits.expense_id
      AND e.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id = expense_splits.expense_id
      AND e.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Expense owners can delete splits" ON public.expense_splits;
CREATE POLICY "Expense owners can delete splits"
ON public.expense_splits
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id = expense_splits.expense_id
      AND e.user_id = auth.uid()
  )
);