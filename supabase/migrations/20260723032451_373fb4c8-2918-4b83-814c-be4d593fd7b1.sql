-- Drop grocery/list feature
DROP TABLE IF EXISTS public.grocery_items CASCADE;
DROP TABLE IF EXISTS public.grocery_lists CASCADE;
DROP FUNCTION IF EXISTS public.notify_group_on_grocery_item() CASCADE;
DROP FUNCTION IF EXISTS public.notify_group_on_grocery_check() CASCADE;

-- Ensure a single, clean set of notification triggers (drop any duplicates first)
DROP TRIGGER IF EXISTS notify_group_on_expense_trigger ON public.expenses;
DROP TRIGGER IF EXISTS trg_notify_group_on_expense ON public.expenses;
DROP TRIGGER IF EXISTS notify_group_on_expense_delete_trigger ON public.expenses;
DROP TRIGGER IF EXISTS trg_notify_group_on_expense_delete ON public.expenses;
DROP TRIGGER IF EXISTS notify_group_on_settlement_trigger ON public.settlements;
DROP TRIGGER IF EXISTS trg_notify_group_on_settlement ON public.settlements;
DROP TRIGGER IF EXISTS send_push_on_notification_trigger ON public.notifications;
DROP TRIGGER IF EXISTS trg_send_push_on_notification ON public.notifications;

CREATE TRIGGER trg_notify_group_on_expense
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_expense();

CREATE TRIGGER trg_notify_group_on_expense_delete
  AFTER DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_expense_delete();

CREATE TRIGGER trg_notify_group_on_settlement
  AFTER INSERT ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.notify_group_on_settlement();

CREATE TRIGGER trg_send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.send_push_on_notification();