import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Wallet, Users } from 'lucide-react';
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

  const userName = user?.user_metadata?.full_name || 'User';

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
        <Card className="border border-border shadow-sm">
          <CardContent className="pt-5 pb-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : 'none'}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-display font-bold">
                      {selectedDate ? format(selectedDate, 'dd-MM-yyyy') : 'Select a date'}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Your share: ₹{selectedDateExpenses?.myShare.toLocaleString('en-IN') || '0'}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    className="h-12 w-12 rounded-xl bg-foreground text-background hover:bg-foreground/90"
                    onClick={() => setAddExpenseOpen(true)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>

                {/* Expense list for selected date */}
                {selectedDateExpenses && selectedDateExpenses.expenses.length > 0 && (
                  <div className="space-y-2 mt-4 max-h-64 overflow-y-auto">
                    {selectedDateExpenses.expenses.map((expense, i) => (
                      <motion.div
                        key={expense.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                          <div className="min-w-0 flex-1">
                            <p className={cn("font-medium text-sm truncate", expense.is_settled && "line-through opacity-60")}>
                              {expense.description}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn(
                                'text-xs px-1.5 py-0.5 rounded-full',
                                expense.expense_type === 'personal'
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-accent text-accent-foreground'
                              )}>
                                {expense.expense_type === 'personal' ? 'Personal' : 'Group'}
                              </span>
                              {expense.is_settled && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />Settled
                                </span>
                              )}
                              {expense.expense_type === 'group' && (
                                <span className="text-xs text-muted-foreground">
                                  Your share: ₹{expense.myShare?.toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="font-bold text-sm ml-3">₹{expense.amount.toLocaleString('en-IN')}</p>
                        </div>
                      </motion.div>
                    ))}
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
    </DashboardLayout>
  );
}
