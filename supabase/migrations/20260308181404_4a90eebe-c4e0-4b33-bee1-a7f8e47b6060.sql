
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Service can read all subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (true);
