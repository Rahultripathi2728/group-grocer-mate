-- 1) Notifications: remember the expense + date so taps can deep-link correctly
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS expense_date date;

-- 2) Insert notification now carries expense reference
CREATE OR REPLACE FUNCTION public.notify_group_on_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  member_id UUID;
  actor_name TEXT;
  group_name TEXT;
BEGIN
  IF NEW.expense_type = 'group' AND NEW.group_id IS NOT NULL THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.user_id;
    SELECT name INTO group_name FROM public.groups WHERE id = NEW.group_id;

    FOR member_id IN
      SELECT user_id FROM public.group_memberships WHERE group_id = NEW.group_id AND user_id != NEW.user_id
      UNION
      SELECT owner_id FROM public.groups WHERE id = NEW.group_id AND owner_id != NEW.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, group_id, expense_id, expense_date)
      VALUES (member_id, 'expense_added', 'New Expense in ' || group_name,
              actor_name || ' added ₹' || NEW.amount || ' for "' || NEW.description || '"',
              NEW.group_id, NEW.id, NEW.expense_date);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Delete notification carries the date too
CREATE OR REPLACE FUNCTION public.notify_group_on_expense_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  member_id UUID;
  actor_name TEXT;
  group_name TEXT;
BEGIN
  IF OLD.expense_type = 'group' AND OLD.group_id IS NOT NULL THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = OLD.user_id;
    SELECT name INTO group_name FROM public.groups WHERE id = OLD.group_id;

    FOR member_id IN
      SELECT user_id FROM public.group_memberships WHERE group_id = OLD.group_id AND user_id != OLD.user_id
      UNION
      SELECT owner_id FROM public.groups WHERE id = OLD.group_id AND owner_id != OLD.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, group_id, expense_date)
      VALUES (member_id, 'expense_deleted', 'Expense Removed in ' || group_name,
              actor_name || ' removed "' || OLD.description || '" (₹' || OLD.amount || ')',
              OLD.group_id, OLD.expense_date);
    END LOOP;
  END IF;
  RETURN OLD;
END;
$function$;

-- 4) NEW: notify group members when a group expense is edited
CREATE OR REPLACE FUNCTION public.notify_group_on_expense_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  member_id UUID;
  actor_name TEXT;
  group_name TEXT;
BEGIN
  IF NEW.expense_type = 'group' AND NEW.group_id IS NOT NULL AND (
       NEW.description IS DISTINCT FROM OLD.description
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
       OR NEW.category IS DISTINCT FROM OLD.category
     ) THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.user_id;
    SELECT name INTO group_name FROM public.groups WHERE id = NEW.group_id;

    FOR member_id IN
      SELECT user_id FROM public.group_memberships WHERE group_id = NEW.group_id AND user_id != auth.uid()
      UNION
      SELECT owner_id FROM public.groups WHERE id = NEW.group_id AND owner_id != auth.uid()
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, group_id, expense_id, expense_date)
      VALUES (member_id, 'expense_updated', 'Expense Updated in ' || group_name,
              COALESCE(actor_name, 'Someone') || ' updated "' || NEW.description || '" to ₹' || NEW.amount,
              NEW.group_id, NEW.id, NEW.expense_date);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_group_on_expense_update ON public.expenses;
CREATE TRIGGER trg_notify_group_on_expense_update
AFTER UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_expense_update();

-- 5) Settlement notification wording (per-person)
CREATE OR REPLACE FUNCTION public.notify_group_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  member_id UUID;
  actor_name TEXT;
  group_name TEXT;
BEGIN
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.settled_by;
  SELECT name INTO group_name FROM public.groups WHERE id = NEW.group_id;

  FOR member_id IN
    SELECT user_id FROM public.group_memberships WHERE group_id = NEW.group_id AND user_id != NEW.settled_by
    UNION
    SELECT owner_id FROM public.groups WHERE id = NEW.group_id AND owner_id != NEW.settled_by
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, group_id)
    VALUES (member_id, 'settlement', 'Settlement in ' || group_name,
            COALESCE(actor_name, 'Someone') || ' settled their share'
            || CASE WHEN NEW.total_amount > 0 THEN ' (₹' || NEW.total_amount || ')' ELSE '' END,
            NEW.group_id);
  END LOOP;
  RETURN NEW;
END;
$function$;

-- 6) Per-person settlement: settles ONLY the caller's own pending shares
CREATE OR REPLACE FUNCTION public.settle_my_share(p_group_id uuid)
RETURNS TABLE(settlement_id uuid, total_amount numeric, splits_settled integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  WITH upd AS (
    UPDATE public.expense_splits s
       SET is_paid = true, paid_at = now()
     WHERE s.user_id = v_user
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

  -- An expense becomes "settled" only once every member has paid their share
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
          'Settled own share of ₹' || v_total::text || ' (' || v_count::text || ' items)')
  RETURNING id INTO v_settlement_id;

  RETURN QUERY SELECT v_settlement_id, v_total, v_count;
END;
$function$;

-- 7) Remove the old "settle everything for everyone" function
DROP FUNCTION IF EXISTS public.settle_group_expenses(uuid);