ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS split_items jsonb;

CREATE OR REPLACE FUNCTION public.lock_expense_when_partially_settled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid;
  v_paid int;
BEGIN
  v_expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  SELECT count(*) INTO v_paid
  FROM public.expense_splits s
  WHERE s.expense_id = v_expense_id AND s.is_paid = true
    AND s.user_id <> (SELECT e.user_id FROM public.expenses e WHERE e.id = v_expense_id);

  IF v_paid > 0 THEN
    RAISE EXCEPTION 'This expense is locked: a member has already settled their share';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_expense_delete ON public.expenses;
CREATE TRIGGER trg_lock_expense_delete
BEFORE DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.lock_expense_when_partially_settled();