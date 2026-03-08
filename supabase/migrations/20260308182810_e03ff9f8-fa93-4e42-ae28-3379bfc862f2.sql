
CREATE TABLE public.vapid_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only service role can access this table (no RLS policies = blocked for anon/authenticated)
ALTER TABLE public.vapid_keys ENABLE ROW LEVEL SECURITY;
