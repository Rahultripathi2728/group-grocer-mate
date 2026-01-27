-- Create budgets table for monthly spending limits
CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  month DATE NOT NULL, -- First day of the month
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

-- Enable RLS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- Users can view their own budgets
CREATE POLICY "Users can view own budgets"
ON public.budgets
FOR SELECT
USING (user_id = auth.uid());

-- Users can create their own budgets
CREATE POLICY "Users can create own budgets"
ON public.budgets
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own budgets
CREATE POLICY "Users can update own budgets"
ON public.budgets
FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own budgets
CREATE POLICY "Users can delete own budgets"
ON public.budgets
FOR DELETE
USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_budgets_updated_at
BEFORE UPDATE ON public.budgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();