
-- Fix CRITICAL: Remove the overly permissive public SELECT policy on push_subscriptions
DROP POLICY IF EXISTS "Service can read all subscriptions" ON public.push_subscriptions;

-- The existing "Users can view own subscriptions" policy already covers user-facing reads.
-- Edge functions use service_role key which bypasses RLS, so no additional policy needed.

-- Ensure vapid_keys has no permissive policies (it currently has RLS enabled with no policies, which is correct)
-- Add an explicit comment for documentation
COMMENT ON TABLE public.vapid_keys IS 'VAPID keys for web push. Access restricted to service_role only via RLS (no policies = deny all).';
