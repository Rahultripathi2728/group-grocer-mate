import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Wallet, Users, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCategoryById } from '@/lib/categories';
import { cn } from '@/lib/utils';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import { motion, AnimatePresence } from 'framer-motion';

interface DayExpense {
  date: string;
  total: number;
  myShare: number;
  hasSettled: boolean;
  hasUnsettled: boolean;
  hasPersonal: boolean;
  hasGroup: boolean;
  allSettled: boolean;
  expenses: Array<{
    id: string;
    description: string;
    amount: number;
    expense_type: string;
    category?: string | null;
    is_settled: boolean;
    myShare?: number;
  }>;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [expensesByDate, setExpensesByDate] = useState<Map<string, DayExpense>>(new Map());
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [detailExpense, setDetailExpense] = useState<DayExpense['expenses'][0] | null>(null);

  const userName = user?.user_metadata?.full_name || 'User';

  const handleDeleteExpense = async (expenseId: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (error) {
      toast.error('Failed to delete expense');
    } else {
      toast.success('Expense deleted');
      setDetailExpense(null);
      fetchExpenses();
    }
  };

  const fetchExpenses = async () => {
    if (!user) return;
    const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
      .order('created_at', { ascending: false });

    if (expenses) {
      // Fetch user's splits for group expenses
      const groupExpenseIds = expenses
        .filter((e) => e.expense_type === 'group')
        .map((e) => e.id);

      let splitsMap = new Map<string, number>();
      if (groupExpenseIds.length > 0) {
        const { data: splits } = await supabase
          .from('expense_splits')
          .select('expense_id, amount_owed')
          .eq('user_id', user.id)
          .in('expense_id', groupExpenseIds);

        (splits || []).forEach((s) => {
          splitsMap.set(s.expense_id, Number(s.amount_owed));
        });
      }

      const grouped = new Map<string, DayExpense>();
      expenses.forEach((expense) => {
        const dateKey = expense.expense_date;
        const existing = grouped.get(dateKey) || {
          date: dateKey,
          total: 0,
          myShare: 0,
          hasSettled: false,
          hasUnsettled: false,
          hasPersonal: false,
          hasGroup: false,
          allSettled: true,
          expenses: [],
        };

        const myShare = expense.expense_type === 'group'
          ? (splitsMap.get(expense.id) || 0)
          : Number(expense.amount);

        existing.total += Number(expense.amount);
        existing.myShare += myShare;
        if (expense.is_settled) existing.hasSettled = true;
        else {
          existing.hasUnsettled = true;
          existing.allSettled = false;
        }
        if (expense.expense_type === 'personal') existing.hasPersonal = true;
        else existing.hasGroup = true;
        existing.expenses.push({
          id: expense.id,
          description: expense.description,
          amount: Number(expense.amount),
          expense_type: expense.expense_type,
          category: expense.category,
          is_settled: expense.is_settled,
          myShare,
        });
        grouped.set(dateKey, existing);
      });
      setExpensesByDate(grouped);
    }
    setLoading(false);
  };

  useEffect(() => { fetchExpenses(); }, [user, currentMonth]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const selectedDateExpenses = selectedDate
    ? expensesByDate.get(format(selectedDate, 'yyyy-MM-dd'))
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in pb-20">
        {/* Header - Welcome User */}
        <div>
          <h1 className="text-3xl font-display font-bold">
            Welcome, {userName.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-1">Track your daily spending</p>
        </div>

        {/* Calendar Card */}
        <Card className="border border-border shadow-sm">
          <CardContent className="pt-5 pb-4">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="rounded-full"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="font-display font-semibold text-base">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="rounded-full"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Week Days Header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day, i) => (
                <div
                  key={i}
                  className="text-center text-[10px] font-semibold text-muted-foreground tracking-wider py-1"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayExpenses = expensesByDate.get(dateKey);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      'relative flex flex-col items-center py-2 rounded-xl transition-all text-sm',
                      !isCurrentMonth && 'text-muted-foreground/30',
                      isCurrentMonth && dayExpenses && !isSelected && 'bg-primary/10',
                      isSelected && 'ring-2 ring-primary bg-primary/5',
                      isToday && !isSelected && 'font-bold'
                    )}
                  >
                    {/* Day number */}
                    <span className={cn(
                      'font-medium',
                      isSelected && 'text-primary font-bold'
                    )}>
                      {format(day, 'd')}
                    </span>

                    {/* Amount (show user's share) */}
                    {dayExpenses && isCurrentMonth && (
                      <span className={cn(
                        'text-[9px] font-bold mt-0.5 text-primary'
                      )}>
                        ₹{dayExpenses.myShare >= 1000
                          ? `${(dayExpenses.myShare / 1000).toFixed(1)}k`
                          : dayExpenses.myShare.toLocaleString('en-IN')}
                      </span>
                    )}

                    {/* Dots for expense types + settled checkmark */}
                    {dayExpenses && isCurrentMonth && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {dayExpenses.allSettled && dayExpenses.hasSettled && (
                          <CheckCircle2 className="h-2.5 w-2.5 text-success" />
                        )}
                        {dayExpenses.hasGroup && !dayExpenses.allSettled && (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        )}
                        {dayExpenses.hasPersonal && !dayExpenses.allSettled && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Date Details */}
        <Card className="border border-border shadow-sm overflow-hidden">
          <CardContent className="pt-5 pb-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : 'none'}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                {/* Date header with summary */}
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-lg font-display font-bold">
                      {selectedDate ? format(selectedDate, 'EEEE') : 'Select a date'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedDate && format(selectedDate, 'dd MMMM yyyy')}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    className="h-11 w-11 rounded-xl bg-foreground text-background hover:bg-foreground/90"
                    onClick={() => setAddExpenseOpen(true)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>

                {/* Summary chips */}
                {selectedDateExpenses && (
                  <div className="flex items-center gap-3 mt-3 mb-4">
                    <div className="flex-1 p-3 rounded-xl bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-sm font-bold">₹{selectedDateExpenses.total.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="flex-1 p-3 rounded-xl bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground">Your Share</p>
                      <p className="text-sm font-bold">₹{selectedDateExpenses.myShare.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="flex-1 p-3 rounded-xl bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground">Items</p>
                      <p className="text-sm font-bold">{selectedDateExpenses.expenses.length}</p>
                    </div>
                  </div>
                )}

                {!selectedDateExpenses && (
                  <div className="text-center py-6 mt-3">
                    <p className="text-sm text-muted-foreground">No expenses on this day</p>
                    <p className="text-xs text-muted-foreground mt-1">Tap + to add one</p>
                  </div>
                )}

                {/* Expense list */}
                {selectedDateExpenses && selectedDateExpenses.expenses.length > 0 && (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {selectedDateExpenses.expenses.map((expense, i) => {
                      const categoryInfo = getCategoryById(expense.category);
                      const CategoryIcon = categoryInfo.icon;
                      return (
                        <motion.div
                          key={expense.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <div
                            onClick={() => setDetailExpense(expense)}
                            className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border border-border transition-all hover:shadow-sm cursor-pointer active:scale-[0.98]",
                            expense.is_settled && "opacity-50"
                          )}>
                            {/* Category icon */}
                            <div className={cn('p-2.5 rounded-xl shrink-0', categoryInfo.bgColor)}>
                              <CategoryIcon className={cn('h-4 w-4', categoryInfo.color)} />
                            </div>

                            {/* Details */}
                            <div className="min-w-0 flex-1">
                              <p className={cn(
                                "font-semibold text-sm truncate",
                                expense.is_settled && "line-through"
                              )}>
                                {expense.description}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={cn(
                                  'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md',
                                  expense.expense_type === 'personal'
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-accent text-accent-foreground'
                                )}>
                                  {expense.expense_type === 'personal'
                                    ? <><Wallet className="h-2.5 w-2.5" /> Personal</>
                                    : <><Users className="h-2.5 w-2.5" /> Group</>
                                  }
                                </span>
                                {expense.is_settled && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-success/10 text-success">
                                    <CheckCircle2 className="h-2.5 w-2.5" />Settled
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Amount + Delete */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <p className="font-bold text-sm">₹{expense.amount.toLocaleString('en-IN')}</p>
                                {expense.expense_type === 'group' && expense.myShare !== undefined && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Share: ₹{expense.myShare.toLocaleString('en-IN')}
                                  </p>
                                )}
                              </div>
                              {!expense.is_settled && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteExpense(expense.id); }}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      <AddExpenseDialog
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
        onSuccess={fetchExpenses}
        selectedDate={selectedDate || undefined}
      />

      {/* Expense Detail Dialog */}
      <Dialog open={!!detailExpense} onOpenChange={(open) => !open && setDetailExpense(null)}>
        <DialogContent className="sm:max-w-md">
          {detailExpense && (() => {
            const catInfo = getCategoryById(detailExpense.category);
            const CatIcon = catInfo.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-xl">Expense Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {/* Icon + Name */}
                  <div className="flex items-center gap-4">
                    <div className={cn('p-3 rounded-xl', catInfo.bgColor)}>
                      <CatIcon className={cn('h-6 w-6', catInfo.color)} />
                    </div>
                    <div>
                      <p className="font-bold text-lg break-words">{detailExpense.description}</p>
                      <p className="text-sm text-muted-foreground">{catInfo.label}</p>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-muted/50">
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className="font-bold text-lg">₹{detailExpense.amount.toLocaleString('en-IN')}</p>
                    </div>
                    {detailExpense.expense_type === 'group' && detailExpense.myShare !== undefined && (
                      <div className="p-3 rounded-xl bg-muted/50">
                        <p className="text-xs text-muted-foreground">Your Share</p>
                        <p className="font-bold text-lg">₹{detailExpense.myShare.toLocaleString('en-IN')}</p>
                      </div>
                    )}
                    <div className="p-3 rounded-xl bg-muted/50">
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-semibold text-sm flex items-center gap-1.5 mt-0.5">
                        {detailExpense.expense_type === 'personal'
                          ? <><Wallet className="h-3.5 w-3.5" /> Personal</>
                          : <><Users className="h-3.5 w-3.5" /> Group</>
                        }
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/50">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className={cn(
                        "font-semibold text-sm flex items-center gap-1.5 mt-0.5",
                        detailExpense.is_settled ? "text-success" : "text-foreground"
                      )}>
                        {detailExpense.is_settled
                          ? <><CheckCircle2 className="h-3.5 w-3.5" /> Settled</>
                          : 'Unsettled'
                        }
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/50">
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="font-semibold text-sm mt-0.5">
                        {selectedDate ? format(selectedDate, 'dd MMM yyyy') : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
