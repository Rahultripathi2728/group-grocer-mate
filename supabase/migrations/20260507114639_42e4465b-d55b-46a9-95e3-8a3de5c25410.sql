
-- =========================================
-- 1. PROFILES: add username
-- =========================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;

CREATE OR REPLACE FUNCTION public.validate_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    NEW.username := lower(NEW.username);
    IF NEW.username !~ '^[a-z0-9_]{3,20}$' THEN
      RAISE EXCEPTION 'Username must be 3-20 chars (letters, numbers, underscore only)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_profile_username ON public.profiles;
CREATE TRIGGER validate_profile_username
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_username();

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- =========================================
-- 2. SEARCH RPC (privacy-safe)
-- =========================================
CREATE OR REPLACE FUNCTION public.search_users_by_username(p_query text)
RETURNS TABLE(id uuid, username text, full_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.id != auth.uid()
    AND p.username LIKE lower(p_query) || '%'
  LIMIT 10;
$$;

-- =========================================
-- 3. FRIENDSHIPS table
-- =========================================
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(requester_id, receiver_id),
  CHECK (requester_id <> receiver_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their friendships"
ON public.friendships FOR SELECT
USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can send friend requests"
ON public.friendships FOR INSERT
WITH CHECK (requester_id = auth.uid() AND status = 'pending');

CREATE POLICY "Receiver can update status"
ON public.friendships FOR UPDATE
USING (receiver_id = auth.uid())
WITH CHECK (receiver_id = auth.uid());

CREATE POLICY "Requester or receiver can delete"
ON public.friendships FOR DELETE
USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE TRIGGER update_friendships_updated_at
BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: are two users friends?
CREATE OR REPLACE FUNCTION public.are_friends(p_user1 uuid, p_user2 uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = p_user1 AND receiver_id = p_user2)
        OR (requester_id = p_user2 AND receiver_id = p_user1))
  );
$$;

-- =========================================
-- 4. LOANS table (Borrow Money)
-- =========================================
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,                -- the user who created the record
  counterparty_user_id uuid,               -- if the other person is an app user
  counterparty_name text,                  -- name if non-app user
  counterparty_contact text,               -- optional phone/contact
  direction text NOT NULL CHECK (direction IN ('lent','borrowed')), -- lent: creator gave money; borrowed: creator received money
  amount numeric NOT NULL CHECK (amount > 0 AND amount <= 99999999),
  description text,
  loan_date date NOT NULL DEFAULT CURRENT_DATE,
  is_settled boolean NOT NULL DEFAULT false,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (counterparty_user_id IS NOT NULL) OR (counterparty_name IS NOT NULL AND length(trim(counterparty_name)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_loans_creator ON public.loans(creator_id);
CREATE INDEX IF NOT EXISTS idx_loans_counterparty ON public.loans(counterparty_user_id);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view loans they're part of"
ON public.loans FOR SELECT
USING (creator_id = auth.uid() OR counterparty_user_id = auth.uid());

CREATE POLICY "Users can create their own loans"
ON public.loans FOR INSERT
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Creator or counterparty can update loans"
ON public.loans FOR UPDATE
USING (creator_id = auth.uid() OR counterparty_user_id = auth.uid());

CREATE POLICY "Creator can delete loans"
ON public.loans FOR DELETE
USING (creator_id = auth.uid());

CREATE TRIGGER update_loans_updated_at
BEFORE UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- 5. EXPENSES: allow 'shared' type (ad-hoc, no group)
-- =========================================
-- Update insert policy to allow 'shared' expenses
DROP POLICY IF EXISTS "Users can insert expenses" ON public.expenses;
CREATE POLICY "Users can insert expenses"
ON public.expenses FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    expense_type = 'personal'
    OR (expense_type = 'group' AND group_id IS NOT NULL AND public.is_group_member(group_id))
    OR (expense_type = 'shared' AND group_id IS NULL)
  )
);

-- Update view policy: 'shared' visible to anyone in its splits
DROP POLICY IF EXISTS "Users can view own or group expenses" ON public.expenses;
CREATE POLICY "Users can view own, group or shared expenses"
ON public.expenses FOR SELECT
USING (
  user_id = auth.uid()
  OR (group_id IS NOT NULL AND public.is_group_member(group_id))
  OR (expense_type = 'shared' AND EXISTS (
    SELECT 1 FROM public.expense_splits s
    WHERE s.expense_id = expenses.id AND s.user_id = auth.uid()
  ))
);
