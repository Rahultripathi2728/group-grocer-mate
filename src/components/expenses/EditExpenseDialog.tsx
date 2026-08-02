import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { categoryList } from '@/lib/categories';
import { toast } from 'sonner';

interface EditableExpense {
  id: string;
  description: string;
  amount: number;
  category?: string | null;
  expense_type: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: EditableExpense | null;
  expenseDate: string; // yyyy-MM-dd
  onSuccess: () => void;
}

export default function EditExpenseDialog({ open, onOpenChange, expense, expenseDate, onSuccess }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('general');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense && open) {
      setDescription(expense.description);
      setAmount(String(expense.amount));
      setCategory(expense.category || 'general');
      setDate(expenseDate);
    }
  }, [expense, expenseDate, open]);

  const handleSave = async () => {
    if (!expense) return;
    const newAmount = Number(amount);
    if (!description.trim()) return toast.error('Description is required');
    if (!newAmount || newAmount <= 0) return toast.error('Enter a valid amount');
    if (!date) return toast.error('Pick a date');

    setSaving(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          description: description.trim(),
          amount: newAmount,
          category,
          expense_date: date,
        })
        .eq('id', expense.id);
      if (error) throw error;

      // Rescale existing splits proportionally when the amount changed
      if (expense.expense_type === 'group' && Math.abs(newAmount - expense.amount) > 0.001) {
        const { data: splits } = await supabase
          .from('expense_splits')
          .select('id, amount_owed')
          .eq('expense_id', expense.id);

        const total = (splits || []).reduce((s, x) => s + Number(x.amount_owed), 0);
        if (splits && splits.length > 0 && total > 0) {
          const factor = newAmount / total;
          await Promise.all(
            splits.map((s) =>
              supabase
                .from('expense_splits')
                .update({ amount_owed: Math.round(Number(s.amount_owed) * factor * 100) / 100 })
                .eq('id', s.id)
            )
          );
        }
      }

      toast.success('Expense updated');
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      console.error(e);
      toast.error('Failed to update expense');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit Expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-desc">Description</Label>
            <Input id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-amount">Amount (₹)</Label>
            <Input
              id="edit-amount"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-date">Date</Label>
            <Input id="edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {expense?.expense_type === 'group' && (
            <p className="text-xs text-muted-foreground">
              Changing the amount keeps each member's share in the same proportion.
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
