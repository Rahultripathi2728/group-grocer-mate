CREATE OR REPLACE FUNCTION public.settle_my_splits(p_group_id uuid, p_split_ids uuid[])
RETURNS TABLE(settlement_id uuid, total_amount numeric, splits_settled integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_total numeric := 0;
  v_count int := 0;
  v_settlement_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  IF p_split_ids IS NULL OR array_length(p_split_ids, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 0::numeric, 0;
    RETURN;
  END IF;

  WITH upd AS (
    UPDATE public.expense_splits s
       SET is_paid = true, paid_at = now()
     WHERE s.id = ANY(p_split_ids)
       AND s.user_id = v_user
       AND s.is_paid = false
       AND EXISTS (
         SELECT 1 FROM public.expenses e
          WHERE e.id = s.expense_id
            AND e.group_id = p_group_id
            AND e.expense_type = 'group'
       )
    RETURNING s.amount_owed
  )
  SELECT COALESCE(SUM(amount_owed), 0), COUNT(*) INTO v_total, v_count FROM upd;

  -- An expense is fully settled only when every member's share is paid
  UPDATE public.expenses e
     SET is_settled = true, settled_at = now()
   WHERE e.group_id = p_group_id
     AND e.expense_type = 'group'
     AND e.is_settled = false
     AND EXISTS (SELECT 1 FROM public.expense_splits s WHERE s.expense_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM public.expense_splits s WHERE s.expense_id = e.id AND s.is_paid = false);

  IF v_count = 0 THEN
    RETURN QUERY SELECT NULL::uuid, 0::numeric, 0;
    RETURN;
  END IF;

  INSERT INTO public.settlements (group_id, settled_by, total_amount, notes)
  VALUES (p_group_id, v_user, v_total,
          'Settled ' || v_count::text || ' selected item(s) worth ₹' || v_total::text)
  RETURNING id INTO v_settlement_id;

  RETURN QUERY SELECT v_settlement_id, v_total, v_count;
END;
$$;