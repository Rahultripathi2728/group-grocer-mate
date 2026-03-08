
-- 1. Notification when someone settles expenses
CREATE OR REPLACE FUNCTION public.notify_group_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
            actor_name || ' settled all expenses' || CASE WHEN NEW.total_amount > 0 THEN ' (₹' || NEW.total_amount || ')' ELSE '' END, NEW.group_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_settlement_created
AFTER INSERT ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_settlement();

-- 2. Notification when someone deletes a group expense
CREATE OR REPLACE FUNCTION public.notify_group_on_expense_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      INSERT INTO public.notifications (user_id, type, title, message, group_id)
      VALUES (member_id, 'expense_deleted', 'Expense Removed in ' || group_name,
              actor_name || ' removed "' || OLD.description || '" (₹' || OLD.amount || ')', OLD.group_id);
    END LOOP;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER on_group_expense_deleted
BEFORE DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_expense_delete();

-- 3. Notification when someone checks/clears a grocery item
CREATE OR REPLACE FUNCTION public.notify_group_on_grocery_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  member_id UUID;
  actor_name TEXT;
  grp_id UUID;
  group_name TEXT;
  current_user_id UUID;
BEGIN
  -- Only trigger when is_checked changes
  IF OLD.is_checked IS DISTINCT FROM NEW.is_checked THEN
    SELECT group_id INTO grp_id FROM public.grocery_lists WHERE id = NEW.list_id;
    
    IF grp_id IS NOT NULL THEN
      current_user_id := auth.uid();
      SELECT full_name INTO actor_name FROM public.profiles WHERE id = current_user_id;
      SELECT name INTO group_name FROM public.groups WHERE id = grp_id;

      FOR member_id IN
        SELECT user_id FROM public.group_memberships WHERE group_id = grp_id AND user_id != current_user_id
        UNION
        SELECT owner_id FROM public.groups WHERE id = grp_id AND owner_id != current_user_id
      LOOP
        INSERT INTO public.notifications (user_id, type, title, message, group_id)
        VALUES (
          member_id,
          CASE WHEN NEW.is_checked THEN 'list_item_checked' ELSE 'list_item_unchecked' END,
          CASE WHEN NEW.is_checked THEN 'Item checked in ' || group_name ELSE 'Item unchecked in ' || group_name END,
          COALESCE(actor_name, 'Someone') || CASE WHEN NEW.is_checked THEN ' checked off "' ELSE ' unchecked "' END || NEW.name || '"',
          grp_id
        );
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_grocery_item_checked
AFTER UPDATE ON public.grocery_items
FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_grocery_check();

-- Also add trigger for existing expense notification (it was missing as trigger)
CREATE TRIGGER on_group_expense_created
AFTER INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_expense();

CREATE TRIGGER on_group_grocery_item_added
AFTER INSERT ON public.grocery_items
FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_grocery_item();
