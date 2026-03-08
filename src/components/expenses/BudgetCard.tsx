import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Target, Edit2, TrendingUp, AlertTriangle } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BudgetCardProps {
  totalSpent: number;
  onBudgetChange?: () => void;
}

export default function BudgetCard({ totalSpent, onBudgetChange }: BudgetCardProps) {
  const { user } = useAuth();
  const [budget, setBudget] = useState<{ id: string; amount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const currentMonth = startOfMonth(new Date());

  const fetchBudget = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('budgets')
      .select('id, amount')
      .eq('user_id', user.id)
      .eq('month', format(currentMonth, 'yyyy-MM-dd'))
      .maybeSingle();

    if (data) {
      setBudget({ id: data.id, amount: Number(data.amount) });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBudget();
  }, [user]);

  const handleSaveBudget = async () => {
    if (!user || !newAmount) return;

    setSaving(true);
    const amount = parseFloat(newAmount);

    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      setSaving(false);
      return;
    }

    if (budget) {
      // Update existing budget
      const { error } = await supabase
        .from('budgets')
        .update({ amount })
        .eq('id', budget.id);

      if (error) {
        toast.error('Failed to update budget');
      } else {
        setBudget({ ...budget, amount });
        toast.success('Budget updated!');
        onBudgetChange?.();
      }
    } else {
      // Create new budget
      const { data, error } = await supabase
        .from('budgets')
        .insert({
          user_id: user.id,
          amount,
          month: format(currentMonth, 'yyyy-MM-dd'),
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to set budget');
      } else {
        setBudget({ id: data.id, amount: Number(data.amount) });
        toast.success('Budget set!');
        onBudgetChange?.();
      }
    }

    setSaving(false);
    setDialogOpen(false);
    setNewAmount('');
  };

  const percentage = budget ? Math.min((totalSpent / budget.amount) * 100, 100) : 0;
  const remaining = budget ? budget.amount - totalSpent : 0;
  const isOverBudget = remaining < 0;
  const isNearLimit = percentage >= 80 && percentage < 100;

  if (loading) {
    return (
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="h-24 bg-muted/50 rounded-xl animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!budget) {
    return (
      <>
        <Card className="border-0 shadow-lg bg-gradient-to-br from-primary/5 via-card to-accent/5 backdrop-blur-sm overflow-hidden">
          <CardContent className="pt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center py-4"
            >
              <div className="p-3 rounded-full bg-primary/10 mb-3">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display font-semibold mb-1">Set Monthly Budget</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Track your spending against a monthly limit
              </p>
              <Button
                onClick={() => setDialogOpen(true)}
                className="gradient-primary text-primary-foreground"
              >
                Set Budget
              </Button>
            </motion.div>
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Set Monthly Budget</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="budget-amount">Budget Amount (₹)</Label>
                <Input
                  id="budget-amount"
                  type="number"
                  placeholder="e.g., 50000"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="h-12 text-lg"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveBudget}
                  disabled={saving || !newAmount}
                  className="flex-1 gradient-primary text-primary-foreground"
                >
                  {saving ? 'Saving...' : 'Set Budget'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2.5 rounded-xl",
                isOverBudget ? "bg-destructive/10" : isNearLimit ? "bg-warning/10" : "bg-primary/10"
              )}>
                {isOverBudget ? (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                ) : (
                  <Target className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <h3 className="font-display font-semibold">Monthly Budget</h3>
                <p className="text-sm text-muted-foreground">{format(new Date(), 'MMMM yyyy')}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setNewAmount(budget.amount.toString());
                setDialogOpen(true);
              }}
              className="h-8 w-8 text-muted-foreground hover:text-primary"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress Section */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-2xl font-display font-bold">
                  ₹{totalSpent.toLocaleString('en-IN')}
                </p>
                <p className="text-sm text-muted-foreground">
                  of ₹{budget.amount.toLocaleString('en-IN')} spent ({percentage.toFixed(0)}%)
                </p>
              </div>
              <div className="text-right">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={isOverBudget ? 'over' : 'under'}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={cn(
                      "text-lg font-semibold",
                      isOverBudget ? "text-destructive" : "text-success"
                    )}
                  >
                    {isOverBudget ? '-' : ''}₹{Math.abs(remaining).toLocaleString('en-IN')}
                  </motion.p>
                </AnimatePresence>
                <p className="text-sm text-muted-foreground">
                  {isOverBudget ? 'over budget' : 'remaining'}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <Progress 
              value={percentage} 
              className={cn(
                "h-3 bg-muted/50",
                isOverBudget && "[&>div]:bg-destructive",
                isNearLimit && !isOverBudget && "[&>div]:bg-warning"
              )}
            />

            {/* Status Message */}
            <AnimatePresence mode="wait">
              {isOverBudget && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>You've exceeded your monthly budget!</span>
                </motion.div>
              )}
              {isNearLimit && !isOverBudget && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-warning/10 text-warning text-sm"
                >
                  <TrendingUp className="h-4 w-4 shrink-0" />
                  <span>You're approaching your budget limit</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Edit Monthly Budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="budget-amount">Budget Amount (₹)</Label>
              <Input
                id="budget-amount"
                type="number"
                placeholder="e.g., 50000"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="h-12 text-lg"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveBudget}
                disabled={saving || !newAmount}
                className="flex-1 gradient-primary text-primary-foreground"
              >
                {saving ? 'Saving...' : 'Update Budget'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
