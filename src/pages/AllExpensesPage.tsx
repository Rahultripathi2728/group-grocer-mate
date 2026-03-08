import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, TrendingDown } from 'lucide-react';
import ExpenseFilters from '@/components/expenses/ExpenseFilters';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import { motion } from 'framer-motion';
import { exportToCSV, exportToPDF } from '@/lib/export-utils';
import { format } from 'date-fns';

interface Expense {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  expense_type: string;
  category?: string | null;
  myShare?: number;
}

export default function AllExpensesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });

  const fetchExpenses = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false });

    if (data) {
      const groupExpenseIds = data
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

      setExpenses(
        data.map((e) => ({
          ...e,
          amount: Number(e.amount),
          myShare: e.expense_type === 'group'
            ? (splitsMap.get(e.id) || 0)
            : Number(e.amount),
        }))
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, [user]);

  // Filter logic
  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesDescription = expense.description.toLowerCase().includes(query);
        const matchesCategory = expense.category?.toLowerCase().includes(query);
        if (!matchesDescription && !matchesCategory) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && expense.category !== categoryFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'all' && expense.expense_type !== typeFilter) {
        return false;
      }

      // Date range filter
      if (dateRange.from) {
        const expenseDate = new Date(expense.expense_date);
        if (expenseDate < dateRange.from) return false;
      }
      if (dateRange.to) {
        const expenseDate = new Date(expense.expense_date);
        if (expenseDate > dateRange.to) return false;
      }

      return true;
    });
  }, [expenses, searchQuery, categoryFilter, typeFilter, dateRange]);

  // Group by date
  const groupedExpenses = useMemo(() => {
    const groups: { [key: string]: Expense[] } = {};
    filteredExpenses.forEach((expense) => {
      const date = expense.expense_date;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(expense);
    });
    return groups;
  }, [filteredExpenses]);

  const handleExportCSV = () => {
    exportToCSV(filteredExpenses, 'expenses');
  };

  const handleExportPDF = () => {
    exportToPDF(filteredExpenses, 'expenses');
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">All Expenses</h1>
            <p className="text-sm text-muted-foreground">Search, filter & export</p>
          </div>
        </div>

        {/* Filters */}
        <ExpenseFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
          totalResults={filteredExpenses.length}
        />

        {/* Expenses List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex p-4 rounded-full bg-muted/50 mb-4">
              <TrendingDown className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No expenses found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try adjusting your filters
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedExpenses).map(([date, dateExpenses], groupIndex) => (
              <div key={date}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1">
                  {format(new Date(date), 'EEEE, dd MMMM yyyy')}
                </h3>
                <div className="space-y-2">
                  {dateExpenses.map((expense, i) => (
                    <motion.div
                      key={expense.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (groupIndex * 0.05) + (i * 0.02) }}
                    >
                      <ExpenseCard {...expense} compact />
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
