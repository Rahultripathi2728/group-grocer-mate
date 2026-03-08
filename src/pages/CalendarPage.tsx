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
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import { motion, AnimatePresence } from 'framer-motion';

interface DayExpense {
  date: string;
  total: number;
  hasSettled: boolean;
  hasUnsettled: boolean;
  hasPersonal: boolean;
  hasGroup: boolean;
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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
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
          hasSettled: false,
          hasUnsettled: false,
          hasPersonal: false,
          hasGroup: false,
          expenses: [],
        };
        existing.total += Number(expense.amount);
        if (expense.is_settled) existing.hasSettled = true;
        else existing.hasUnsettled = true;
        if (expense.expense_type === 'personal') existing.hasPersonal = true;
        else existing.hasGroup = true;
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
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold">
            {format(currentMonth, 'MMMM yyyy')}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCurrentMonth(new Date());
                  setSelectedDate(new Date());
                }}
                className="font-display font-semibold text-base"
              >
                Today
              </Button>
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

                    {/* Amount */}
                    {dayExpenses && isCurrentMonth && (
                      <span className={cn(
                        'text-[9px] font-bold mt-0.5',
                        isSelected ? 'text-primary' : 'text-primary'
                      )}>
                        ₹{dayExpenses.total >= 1000
                          ? `${(dayExpenses.total / 1000).toFixed(1)}k`
                          : dayExpenses.total.toLocaleString('en-IN')}
                      </span>
                    )}

                    {/* Dots for expense types */}
                    {dayExpenses && isCurrentMonth && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {dayExpenses.hasGroup && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(280,60%,60%)]" />
                        )}
                        {dayExpenses.hasPersonal && (
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
                      Total spent: ₹{selectedDateExpenses?.total.toLocaleString('en-IN') || '0'}
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
                        <ExpenseCard {...expense} compact onDelete={fetchExpenses} />
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
