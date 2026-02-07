
-- Add check constraints to enforce valid numeric ranges
ALTER TABLE budgets 
ADD CONSTRAINT budgets_amount_positive 
CHECK (amount > 0 AND amount < 99999999);

ALTER TABLE expenses 
ADD CONSTRAINT expenses_amount_positive 
CHECK (amount > 0 AND amount < 99999999);

ALTER TABLE expense_splits 
ADD CONSTRAINT expense_splits_amount_valid 
CHECK (amount_owed >= 0 AND amount_owed < 99999999);

ALTER TABLE grocery_items 
ADD CONSTRAINT grocery_items_quantity_valid 
CHECK (quantity > 0 AND quantity < 10000);
