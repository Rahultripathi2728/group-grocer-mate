-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create groups table
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group_memberships table
CREATE TABLE public.group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expense_type TEXT NOT NULL DEFAULT 'personal' CHECK (expense_type IN ('personal', 'group')),
  category TEXT DEFAULT 'general',
  is_settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create expense_splits table (for group expense division)
CREATE TABLE public.expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_owed DECIMAL(12,2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(expense_id, user_id)
);

-- Create grocery_lists table
CREATE TABLE public.grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Shopping List',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create grocery_items table
CREATE TABLE public.grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.grocery_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settlements table for tracking payment settlements
CREATE TABLE public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  settled_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  settled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is a group member
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_memberships
    WHERE group_id = p_group_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = p_group_id AND owner_id = auth.uid()
  );
$$;

-- Helper function: Check if user is group admin/owner
CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = p_group_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.group_memberships
    WHERE group_id = p_group_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Groups policies
CREATE POLICY "Users can view groups they belong to"
  ON public.groups FOR SELECT
  USING (public.is_group_member(id));

CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins can update groups"
  ON public.groups FOR UPDATE
  USING (public.is_group_admin(id));

CREATE POLICY "Admins can delete groups"
  ON public.groups FOR DELETE
  USING (public.is_group_admin(id));

-- Group memberships policies
CREATE POLICY "Members can view group memberships"
  ON public.group_memberships FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Admins can add members"
  ON public.group_memberships FOR INSERT
  WITH CHECK (public.is_group_admin(group_id) OR user_id = auth.uid());

CREATE POLICY "Admins can update memberships"
  ON public.group_memberships FOR UPDATE
  USING (public.is_group_admin(group_id));

CREATE POLICY "Admins or self can delete memberships"
  ON public.group_memberships FOR DELETE
  USING (public.is_group_admin(group_id) OR user_id = auth.uid());

-- Expenses policies
CREATE POLICY "Users can view own or group expenses"
  ON public.expenses FOR SELECT
  USING (
    user_id = auth.uid() OR 
    (group_id IS NOT NULL AND public.is_group_member(group_id))
  );

CREATE POLICY "Users can insert expenses"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND (
      expense_type = 'personal' OR 
      (expense_type = 'group' AND group_id IS NOT NULL AND public.is_group_member(group_id))
    )
  );

CREATE POLICY "Users can update own expenses"
  ON public.expenses FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own expenses"
  ON public.expenses FOR DELETE
  USING (user_id = auth.uid());

-- Expense splits policies
CREATE POLICY "Users can view splits for their expenses"
  ON public.expense_splits FOR SELECT
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.expenses e 
      WHERE e.id = expense_id AND (e.user_id = auth.uid() OR public.is_group_member(e.group_id))
    )
  );

CREATE POLICY "Expense owners can manage splits"
  ON public.expense_splits FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.user_id = auth.uid())
  );

CREATE POLICY "Users can update their own splits"
  ON public.expense_splits FOR UPDATE
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Expense owners can delete splits"
  ON public.expense_splits FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.user_id = auth.uid())
  );

-- Grocery lists policies
CREATE POLICY "Users can view own or group lists"
  ON public.grocery_lists FOR SELECT
  USING (
    user_id = auth.uid() OR 
    (group_id IS NOT NULL AND public.is_group_member(group_id))
  );

CREATE POLICY "Users can create lists"
  ON public.grocery_lists FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own lists"
  ON public.grocery_lists FOR UPDATE
  USING (user_id = auth.uid() OR (group_id IS NOT NULL AND public.is_group_admin(group_id)));

CREATE POLICY "Users can delete own lists"
  ON public.grocery_lists FOR DELETE
  USING (user_id = auth.uid() OR (group_id IS NOT NULL AND public.is_group_admin(group_id)));

-- Grocery items policies
CREATE POLICY "Users can view list items"
  ON public.grocery_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_lists l 
      WHERE l.id = list_id AND (l.user_id = auth.uid() OR public.is_group_member(l.group_id))
    )
  );

CREATE POLICY "Users can add items to accessible lists"
  ON public.grocery_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.grocery_lists l 
      WHERE l.id = list_id AND (l.user_id = auth.uid() OR public.is_group_member(l.group_id))
    )
  );

CREATE POLICY "Users can update items in accessible lists"
  ON public.grocery_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_lists l 
      WHERE l.id = list_id AND (l.user_id = auth.uid() OR public.is_group_member(l.group_id))
    )
  );

CREATE POLICY "Users can delete items from accessible lists"
  ON public.grocery_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_lists l 
      WHERE l.id = list_id AND (l.user_id = auth.uid() OR public.is_group_member(l.group_id))
    )
  );

-- Settlements policies
CREATE POLICY "Group members can view settlements"
  ON public.settlements FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Group members can create settlements"
  ON public.settlements FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND settled_by = auth.uid());

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_grocery_lists_updated_at
  BEFORE UPDATE ON public.grocery_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();