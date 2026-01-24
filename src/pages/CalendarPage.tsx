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
import { ChevronLeft, ChevronRight, Plus, Wallet, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';

interface DayExpense {
  date: string;
  total: number;
  expenses: Array<{
    id: string;
    description: string;
    amount: number;
    expense_type: string;
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

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const selectedDateExpenses = selectedDate
    ? expensesByDate.get(format(selectedDate, 'yyyy-MM-dd'))
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Calendar</h1>
            <p className="text-muted-foreground mt-1">Track your daily expenses</p>
          </div>
          <Button
            onClick={() => {
              setSelectedDate(new Date());
              setAddExpenseOpen(true);
            }}
            className="gradient-primary text-primary-foreground shadow-glow-sm hover:shadow-glow transition-shadow"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <Card className="lg:col-span-2 border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="font-display text-xl">
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Week Days Header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-muted-foreground py-2"
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
                        'relative aspect-square p-1 rounded-lg transition-all text-sm',
                        !isCurrentMonth && 'text-muted-foreground/40',
                        isToday && 'ring-2 ring-primary',
                        isSelected && 'bg-primary text-primary-foreground',
                        !isSelected && isCurrentMonth && 'hover:bg-muted',
                        dayExpenses && !isSelected && 'bg-accent'
                      )}
                    >
                      <span className="absolute top-1 left-2 font-medium">
                        {format(day, 'd')}
                      </span>
                      {dayExpenses && (
                        <span
                          className={cn(
                            'absolute bottom-1 left-1 right-1 text-[10px] font-semibold truncate',
                            isSelected ? 'text-primary-foreground' : 'text-primary'
                          )}
                        >
                          ₹{dayExpenses.total.toLocaleString('en-IN')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Details */}
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="font-display">
                {selectedDate
                  ? format(selectedDate, 'dd MMMM yyyy')
                  : 'Select a date'}
              </CardTitle>
              {selectedDate && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-primary"
                  onClick={() => setAddExpenseOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!selectedDate ? (
                <p className="text-muted-foreground text-center py-8">
                  Click on a date to see expenses
                </p>
              ) : !selectedDateExpenses ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No expenses on this day</p>
                  <Button
                    variant="outline"
                    onClick={() => setAddExpenseOpen(true)}
                    className="text-primary"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Expense
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10">
                    <span className="font-medium">Total</span>
                    <span className="font-bold text-lg">
                      ₹{selectedDateExpenses.total.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {selectedDateExpenses.expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'p-1.5 rounded-md',
                              expense.expense_type === 'personal'
                                ? 'bg-primary/10'
                                : 'bg-accent'
                            )}
                          >
                            {expense.expense_type === 'personal' ? (
                              <Wallet className="h-3 w-3 text-primary" />
                            ) : (
                              <Users className="h-3 w-3 text-accent-foreground" />
                            )}
                          </div>
                          <span className="text-sm font-medium truncate max-w-[120px]">
                            {expense.description}
                          </span>
                        </div>
                        <span className="font-semibold text-sm">
                          ₹{expense.amount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
