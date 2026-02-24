
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'expense_added', 'list_item_added', 'expense_split'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

-- Users can update own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
USING (user_id = auth.uid());

-- Allow insert for authenticated users (notifications for group members)
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Function to notify group members on expense added
CREATE OR REPLACE FUNCTION public.notify_group_on_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  member_id UUID;
  actor_name TEXT;
  group_name TEXT;
BEGIN
  IF NEW.expense_type = 'group' AND NEW.group_id IS NOT NULL THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.user_id;
    SELECT name INTO group_name FROM public.groups WHERE id = NEW.group_id;

    -- Notify all group members except the actor
    FOR member_id IN
      SELECT user_id FROM public.group_memberships WHERE group_id = NEW.group_id AND user_id != NEW.user_id
      UNION
      SELECT owner_id FROM public.groups WHERE id = NEW.group_id AND owner_id != NEW.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, group_id)
      VALUES (member_id, 'expense_added', 'New Expense in ' || group_name,
              actor_name || ' added ₹' || NEW.amount || ' for "' || NEW.description || '"', NEW.group_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_expense_inserted
AFTER INSERT ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.notify_group_on_expense();

-- Function to notify group members on grocery item added
CREATE OR REPLACE FUNCTION public.notify_group_on_grocery_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  member_id UUID;
  actor_name TEXT;
  grp_id UUID;
  group_name TEXT;
BEGIN
  SELECT group_id INTO grp_id FROM public.grocery_lists WHERE id = NEW.list_id;
  
  IF grp_id IS NOT NULL THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.added_by;
    SELECT name INTO group_name FROM public.groups WHERE id = grp_id;

    FOR member_id IN
      SELECT user_id FROM public.group_memberships WHERE group_id = grp_id AND user_id != NEW.added_by
      UNION
      SELECT owner_id FROM public.groups WHERE id = grp_id AND owner_id != NEW.added_by
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, group_id)
      VALUES (member_id, 'list_item_added', 'New item in ' || group_name || ' list',
              COALESCE(actor_name, 'Someone') || ' added "' || NEW.name || '"', grp_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_grocery_item_inserted
AFTER INSERT ON public.grocery_items
FOR EACH ROW
EXECUTE FUNCTION public.notify_group_on_grocery_item();
