import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Wallet, Users, Sparkles } from 'lucide-react';
import { detectCategory, getCategoryById } from '@/lib/categories';

interface Group {
  id: string;
  name: string;
}

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  selectedDate?: Date;
}

export default function AddExpenseDialog({
  open,
  onOpenChange,
  onSuccess,
  selectedDate,
}: AddExpenseDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [expenseType, setExpenseType] = useState<'personal' | 'group'>('personal');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [category, setCategory] = useState('general');
  const [autoDetected, setAutoDetected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (open && user) {
      fetchGroups();
    }
  }, [open, user]);

  const fetchGroups = async () => {
    if (!user) return;

    const { data: ownedGroups } = await supabase
      .from('groups')
      .select('id, name')
      .eq('owner_id', user.id);

    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('group_id, groups(id, name)')
      .eq('user_id', user.id);

    const memberGroups = (memberships || [])
      .map((m) => m.groups)
      .filter(Boolean) as { id: string; name: string }[];

    const allGroups = [...(ownedGroups || []), ...memberGroups];
    const uniqueGroups = allGroups.filter(
      (group, index, self) => index === self.findIndex((g) => g.id === group.id)
    );
    setGroups(uniqueGroups);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const description = (formData.get('description') as string || '').trim().slice(0, 500);
    const amountRaw = parseFloat(formData.get('amount') as string);
    const date = formData.get('date') as string;
    const category = (formData.get('category') as string || 'general').slice(0, 50);

    if (!description || description.length === 0) {
      toast.error('Description is required');
      setLoading(false);
      return;
    }

    if (isNaN(amountRaw) || amountRaw <= 0 || amountRaw > 99999999) {
      toast.error('Amount must be between 0.01 and 99,999,999');
      setLoading(false);
      return;
    }

    const amount = Math.round(amountRaw * 100) / 100;

    const expenseData = {
      user_id: user.id,
      description,
      amount,
      expense_date: date,
      expense_type: expenseType,
      category: category || 'general',
      group_id: expenseType === 'group' && selectedGroup ? selectedGroup : null,
    };

    const { data: expense, error } = await supabase
      .from('expenses')
      .insert(expenseData)
      .select()
      .single();

    if (error) {
      toast.error('Failed to add expense');
      console.error(error);
    } else {
      // If it's a group expense, create splits for all members
      if (expenseType === 'group' && selectedGroup) {
        const { data: members } = await supabase
          .from('group_memberships')
          .select('user_id')
          .eq('group_id', selectedGroup);

        // Include owner too
        const { data: group } = await supabase
          .from('groups')
          .select('owner_id')
          .eq('id', selectedGroup)
          .single();

        if (members && group) {
          const allMembers = [
            ...members.map((m) => m.user_id),
            group.owner_id,
          ].filter((id, index, self) => self.indexOf(id) === index);

          const splitAmount = amount / allMembers.length;

          const splits = allMembers.map((memberId) => ({
            expense_id: expense.id,
            user_id: memberId,
            amount_owed: splitAmount,
            is_paid: memberId === user.id, // Creator pays their share automatically
          }));

          await supabase.from('expense_splits').insert(splits);
        }
      }

      toast.success('Expense added successfully!');
      onSuccess();
      onOpenChange(false);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add Expense</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Expense Type Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setExpenseType('personal')}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                expenseType === 'personal'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Wallet className="h-4 w-4" />
              <span className="font-medium">Personal</span>
            </button>
            <button
              type="button"
              onClick={() => setExpenseType('group')}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                expenseType === 'group'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Users className="h-4 w-4" />
              <span className="font-medium">Group</span>
            </button>
          </div>

          {/* Group Selection */}
          {expenseType === 'group' && (
            <div className="space-y-2">
              <Label>Select Group</Label>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No groups available
                    </SelectItem>
                  ) : (
                    groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="What did you buy?"
              required
              className="resize-none"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={
                  selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
                }
                required
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select name="category" defaultValue="general">
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="food">Food & Groceries</SelectItem>
                <SelectItem value="transport">Transport</SelectItem>
                <SelectItem value="utilities">Utilities</SelectItem>
                <SelectItem value="entertainment">Entertainment</SelectItem>
                <SelectItem value="shopping">Shopping</SelectItem>
                <SelectItem value="health">Health</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (expenseType === 'group' && !selectedGroup)}
              className="flex-1 bg-foreground text-background hover:bg-foreground/90"
            >
              {loading ? 'Adding...' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
