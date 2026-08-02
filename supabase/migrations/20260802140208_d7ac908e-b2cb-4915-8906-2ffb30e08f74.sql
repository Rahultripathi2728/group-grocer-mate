-- Remove duplicate triggers (kept a single canonical trigger for each event)
DROP TRIGGER IF EXISTS on_group_expense_created ON public.expenses;
DROP TRIGGER IF EXISTS on_group_expense_deleted ON public.expenses;
DROP TRIGGER IF EXISTS on_settlement_created ON public.settlements;
DROP TRIGGER IF EXISTS trg_send_push_on_notification ON public.notifications;
DROP TRIGGER IF EXISTS trigger_send_push_on_notification ON public.notifications;