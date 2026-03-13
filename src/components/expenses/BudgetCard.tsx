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
import { Target, ChevronRight, TrendingUp, AlertTriangle } from 'lucide-react';
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
    if (data) setBudget({ id: data.id, amount: Number(data.amount) });
    setLoading(false);
  };

  useEffect(() => { fetchBudget(); }, [user]);

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
      const { error } = await supabase.from('budgets').update({ amount }).eq('id', budget.id);
      if (error) { toast.error('Failed to update budget'); }
      else { setBudget({ ...budget, amount }); toast.success('Budget updated!'); onBudgetChange?.(); }
    } else {
      const { data, error } = await supabase
        .from('budgets')
        .insert({ user_id: user.id, amount, month: format(currentMonth, 'yyyy-MM-dd') })
        .select()
        .single();
      if (error) { toast.error('Failed to set budget'); }
      else { setBudget({ id: data.id, amount: Number(data.amount) }); toast.success('Budget set!'); onBudgetChange?.(); }
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
      <Card className="border border-border shadow-sm">
        <CardContent className="pt-6">
          <div className="h-24 bg-muted/50 rounded-xl animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!budget) {
    return (
      <>
        <Card className="border border-border shadow-sm overflow-hidden">
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
              <p className="text-sm text-muted-foreground mb-4">Track your spending against a monthly limit</p>
              <Button onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground">
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
                <Input id="budget-amount" type="number" placeholder="e.g., 50000" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="h-12 text-lg" autoFocus />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleSaveBudget} disabled={saving || !newAmount} className="flex-1 bg-primary text-primary-foreground">{saving ? 'Saving...' : 'Set Budget'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {/* Dark budget card matching reference */}
      <Card className="border-0 shadow-lg overflow-hidden bg-foreground text-background">
        <CardContent className="pt-4 pb-4 sm:pt-6 sm:pb-6">
          <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-background/60">Monthly Budget</p>
              <p className="text-xl sm:text-3xl font-display font-bold mt-0.5 sm:mt-1 truncate">
                ₹{budget.amount.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-background/60">Spent</p>
              <p className={cn(
                "text-lg sm:text-2xl font-display font-bold mt-0.5 sm:mt-1 truncate",
                isOverBudget ? "text-destructive" : "text-background"
              )}>
                ₹{totalSpent.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress 
              value={percentage} 
              className={cn(
                "h-2.5 rounded-full bg-background/30",
                isOverBudget 
                  ? "[&>div]:bg-destructive" 
                  : isNearLimit 
                    ? "[&>div]:bg-warning" 
                    : percentage >= 50 
                      ? "[&>div]:bg-amber-400"
                      : "[&>div]:bg-success"
              )}
            />
            <div className="flex justify-between text-xs text-background/60">
              <span>{percentage.toFixed(0)}% used</span>
              <span>₹{Math.abs(remaining).toLocaleString('en-IN')} {isOverBudget ? 'over' : 'remaining'}</span>
            </div>
          </div>

          {/* Edit Budget Link */}
          <button
            onClick={() => { setNewAmount(budget.amount.toString()); setDialogOpen(true); }}
            className="flex items-center gap-1 mt-4 text-background/70 text-sm font-semibold hover:text-background hover:underline"
          >
            Edit Budget <ChevronRight className="h-4 w-4" />
          </button>

          {/* Status Messages */}
          <AnimatePresence mode="wait">
            {isOverBudget && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 p-3 rounded-xl bg-destructive/20 text-destructive mt-4 text-sm"
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
                className="flex items-center gap-2 p-3 rounded-xl bg-warning/20 text-warning mt-4 text-sm"
              >
                <TrendingUp className="h-4 w-4 shrink-0" />
                <span>You're approaching your budget limit</span>
              </motion.div>
            )}
          </AnimatePresence>
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
              <Input id="budget-amount" type="number" placeholder="e.g., 50000" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="h-12 text-lg" autoFocus />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSaveBudget} disabled={saving || !newAmount} className="flex-1 bg-primary text-primary-foreground">{saving ? 'Saving...' : 'Update Budget'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
