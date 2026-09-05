ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS counterparty_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.settle_my_share(uuid);
DROP FUNCTION IF EXISTS public.settle_my_splits(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.settle_with_member(p_group_id uuid, p_other_user uuid)
RETURNS TABLE(settlement_id uuid, net_amount numeric, splits_settled integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_i_owe numeric := 0;
  v_they_owe numeric := 0;
  v_count int := 0;
  v_net numeric := 0;
  v_settlement_id uuid;
  v_other_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_other_user IS NULL OR p_other_user = v_user THEN
    RAISE EXCEPTION 'Invalid counterparty';
  END IF;
  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  -- Both legs of this pair are cleared together: the net amount is what actually changes hands.
  WITH upd AS (
    UPDATE public.expense_splits s
       SET is_paid = true, paid_at = now()
     WHERE s.is_paid = false
       AND EXISTS (
         SELECT 1 FROM public.expenses e
          WHERE e.id = s.expense_id
            AND e.group_id = p_group_id
            AND e.expense_type = 'group'
            AND (
              (s.user_id = v_user AND e.user_id = p_other_user)
              OR (s.user_id = p_other_user AND e.user_id = v_user)
            )
       )
    RETURNING s.user_id, s.amount_owed
  )
  SELECT
    COALESCE(SUM(amount_owed) FILTER (WHERE user_id = v_user), 0),
    COALESCE(SUM(amount_owed) FILTER (WHERE user_id = p_other_user), 0),
    COUNT(*)
  INTO v_i_owe, v_they_owe, v_count
  FROM upd;

  IF v_count = 0 THEN
    RETURN QUERY SELECT NULL::uuid, 0::numeric, 0;
    RETURN;
  END IF;

  v_net := round(v_i_owe - v_they_owe, 2);

  -- An expense is fully settled only once every member's share is paid
  UPDATE public.expenses e
     SET is_settled = true, settled_at = now()
   WHERE e.group_id = p_group_id
     AND e.expense_type = 'group'
     AND e.is_settled = false
     AND EXISTS (SELECT 1 FROM public.expense_splits s WHERE s.expense_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM public.expense_splits s WHERE s.expense_id = e.id AND s.is_paid = false);

  SELECT full_name INTO v_other_name FROM public.profiles WHERE id = p_other_user;

  INSERT INTO public.settlements (group_id, settled_by, counterparty_id, total_amount, notes)
  VALUES (
    p_group_id, v_user, p_other_user, abs(v_net),
    CASE
      WHEN v_net >= 0 THEN 'Paid ' || COALESCE(v_other_name, 'member') || ' ₹' || abs(v_net)::text || ' (net of ' || v_count::text || ' items)'
      ELSE 'Received ₹' || abs(v_net)::text || ' from ' || COALESCE(v_other_name, 'member') || ' (net of ' || v_count::text || ' items)'
    END
  )
  RETURNING id INTO v_settlement_id;

  RETURN QUERY SELECT v_settlement_id, v_net, v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.settle_with_member(uuid, uuid) TO authenticated;