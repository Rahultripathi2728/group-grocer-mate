
CREATE OR REPLACE FUNCTION public.settle_group_expenses(p_group_id uuid)
RETURNS TABLE(settlement_id uuid, total_amount numeric, expenses_settled int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_total numeric := 0;
  v_count int := 0;
  v_settlement_id uuid;
  v_ids uuid[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_ids, v_total, v_count
  FROM public.expenses
  WHERE group_id = p_group_id
    AND expense_type = 'group'
    AND is_settled = false;

  IF v_count = 0 THEN
    RETURN QUERY SELECT NULL::uuid, 0::numeric, 0;
    RETURN;
  END IF;

  UPDATE public.expenses
     SET is_settled = true, settled_at = now()
   WHERE id = ANY(v_ids);

  UPDATE public.expense_splits
     SET is_paid = true, paid_at = now()
   WHERE expense_id = ANY(v_ids);

  INSERT INTO public.settlements (group_id, settled_by, total_amount, notes)
  VALUES (p_group_id, v_user, v_total,
          'Settled ₹' || v_total::text || ' (' || v_count::text || ' expenses)')
  RETURNING id INTO v_settlement_id;

  RETURN QUERY SELECT v_settlement_id, v_total, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_group_expenses(uuid) TO authenticated;
