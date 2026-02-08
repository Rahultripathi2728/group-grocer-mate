import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import { motion, AnimatePresence } from 'framer-motion';

interface DayExpense {
  date: string;
  total: number;
  expenses: Array<{
    id: string;
    description: string;
    amount: number;
    expense_type: string;
    category?: string | null;
    is_settled: boolean;
  }>;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [expensesByDate, setExpensesByDate] = useState<Map<string, DayExpense>>(new Map());
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

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
      const grouped = new Map<string, DayExpense>();
      expenses.forEach((expense) => {
        const dateKey = expense.expense_date;
        const existing = grouped.get(dateKey) || {
          date: dateKey,
          total: 0,
          expenses: [],
        };
        existing.total += Number(expense.amount);
        existing.expenses.push({
          id: expense.id,
          description: expense.description,
          amount: Number(expense.amount),
          expense_type: expense.expense_type,
          category: expense.category,
          is_settled: expense.is_settled,
        });
        grouped.set(dateKey, existing);
      });
      setExpensesByDate(grouped);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, [user, currentMonth]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const selectedDateExpenses = selectedDate
    ? expensesByDate.get(format(selectedDate, 'yyyy-MM-dd'))
    : null;

  // Calculate max expense for intensity
  const maxDayExpense = Math.max(
    ...Array.from(expensesByDate.values()).map((d) => d.total),
    1
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-20">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">Track your daily expenses</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <Card className="lg:col-span-2 border-0 shadow-lg bg-card/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="rounded-full hover:bg-primary/10"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="font-display text-xl min-w-[180px] text-center">
                  {format(currentMonth, 'MMMM yyyy')}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="rounded-full hover:bg-primary/10"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentMonth(new Date())}
                className="text-primary"
              >
                Today
              </Button>
            </CardHeader>
            <CardContent>
              {/* Week Days Header */}
              <div className="grid grid-cols-7 gap-1 mb-3">
                {weekDays.map((day, i) => (
                  <div
                    key={i}
                    className="text-center text-xs font-semibold text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, index) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayExpenses = expensesByDate.get(dateKey);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isToday = isSameDay(day, new Date());
                  const isSelected = selectedDate && isSameDay(day, selectedDate);

                  // Calculate intensity based on spending
                  const intensity = dayExpenses
                    ? Math.min(dayExpenses.total / maxDayExpense, 1)
                    : 0;

                  return (
                    <motion.button
                      key={dateKey}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.005 }}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        'relative aspect-square p-1 rounded-xl transition-all text-sm font-medium',
                        'hover:ring-2 hover:ring-primary/30 focus:outline-none focus:ring-2 focus:ring-primary',
                        !isCurrentMonth && 'text-muted-foreground/30',
                        isToday && !isSelected && 'ring-2 ring-primary/50',
                        isSelected && 'bg-primary text-primary-foreground ring-2 ring-primary shadow-glow-sm'
                      )}
                      style={{
                        backgroundColor:
                          !isSelected && dayExpenses && isCurrentMonth
                            ? `hsl(var(--primary) / ${0.1 + intensity * 0.3})`
                            : undefined,
                      }}
                    >
                      <span className="absolute top-1.5 left-1/2 -translate-x-1/2">
                        {format(day, 'd')}
                      </span>
                      {dayExpenses && isCurrentMonth && (
                        <span
                          className={cn(
                            'absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold',
                            isSelected ? 'text-primary-foreground' : 'text-primary'
                          )}
                        >
                          ₹{dayExpenses.total >= 1000
                            ? `${(dayExpenses.total / 1000).toFixed(1)}k`
                            : dayExpenses.total.toLocaleString('en-IN')}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Details */}
          <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-lg">
                {selectedDate ? format(selectedDate, 'dd MMMM') : 'Select a date'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AnimatePresence mode="wait">
                {!selectedDate ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-12"
                  >
                    <Sparkles className="h-12 w-12 text-primary/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      Click on a date to see expenses
                    </p>
                  </motion.div>
                ) : !selectedDateExpenses ? (
                  <motion.div
                    key="no-expenses"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-center py-8"
                  >
                    <div className="inline-flex p-4 rounded-full bg-muted/50 mb-4">
                      <Sparkles className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">No expenses on this day</p>
                    <Button
                      onClick={() => setAddExpenseOpen(true)}
                      className="mt-4 gradient-primary text-primary-foreground"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add expense on this date
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="expenses"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                      <p className="text-sm text-muted-foreground">Total Spent</p>
                      <p className="text-3xl font-display font-bold text-primary">
                        ₹{selectedDateExpenses.total.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {selectedDateExpenses.expenses.map((expense, i) => (
                        <motion.div
                          key={expense.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <ExpenseCard {...expense} compact />
                        </motion.div>
                      ))}
                    </div>
                    <Button
                      onClick={() => setAddExpenseOpen(true)}
                      variant="outline"
                      className="w-full mt-4 border-primary/30 text-primary hover:bg-primary/10"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add expense on this date
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>

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
