
-- Add total_amount column to settlements table to track how much was settled
ALTER TABLE public.settlements ADD COLUMN total_amount numeric DEFAULT 0;
