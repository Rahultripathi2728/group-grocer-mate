
-- Fix: Replace overly permissive INSERT policy with a proper one
DROP POLICY "Authenticated users can insert notifications" ON public.notifications;

-- Only allow inserts where user_id matches the authenticated user (for manual inserts if needed)
-- The triggers use SECURITY DEFINER so they bypass RLS
CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (user_id = auth.uid());
