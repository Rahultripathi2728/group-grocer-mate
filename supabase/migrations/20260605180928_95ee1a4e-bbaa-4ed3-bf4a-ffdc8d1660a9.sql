-- Attach push notification dispatcher trigger to notifications table.
-- The send_push_on_notification() function already exists but no trigger was firing it.
DROP TRIGGER IF EXISTS trg_notifications_send_push ON public.notifications;
CREATE TRIGGER trg_notifications_send_push
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.send_push_on_notification();