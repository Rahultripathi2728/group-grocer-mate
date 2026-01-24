import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Calendar,
  Plus,
  ArrowRight,
  ShoppingCart,
} from 'lucide-react';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';

interface ExpenseSummary {
  totalPersonal: number;
  totalGroup: number;
  recentExpenses: Array<{
    id: string;
    description: string;
    amount: number;
    expense_date: string;
    expense_type: string;
  }>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<ExpenseSummary>({
    totalPersonal: 0,
    totalGroup: 0,
    recentExpenses: [],
  });
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  const fetchSummary = async () => {
    if (!user) return;

    const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    // Fetch expenses for current month
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
      .order('expense_date', { ascending: false });

    if (expenses) {
      const personal = expenses
        .filter((e) => e.expense_type === 'personal')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const group = expenses
        .filter((e) => e.expense_type === 'group')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      setSummary({
        totalPersonal: personal,
        totalGroup: group,
        recentExpenses: expenses.slice(0, 5),
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchSummary();
  }, [user]);

  const stats = [
    {
      title: 'Personal Expenses',
      value: `₹${summary.totalPersonal.toLocaleString('en-IN')}`,
      icon: Wallet,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Group Expenses',
      value: `₹${summary.totalGroup.toLocaleString('en-IN')}`,
      icon: Users,
      color: 'text-accent-foreground',
      bgColor: 'bg-accent',
    },
    {
      title: 'Total This Month',
      value: `₹${(summary.totalPersonal + summary.totalGroup).toLocaleString('en-IN')}`,
      icon: TrendingUp,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              {format(new Date(), 'MMMM yyyy')} Overview
            </p>
          </div>
          <Button
            onClick={() => setAddExpenseOpen(true)}
            className="gradient-primary text-primary-foreground shadow-glow-sm hover:shadow-glow transition-shadow"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat) => (
            <Card key={stat.title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-display font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions & Recent Expenses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="font-display">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to="/calendar">
                <Button variant="outline" className="w-full justify-between h-14 group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <span>View Calendar</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/groups">
                <Button variant="outline" className="w-full justify-between h-14 group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent">
                      <Users className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <span>Manage Groups</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/grocery">
                <Button variant="outline" className="w-full justify-between h-14 group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <ShoppingCart className="h-4 w-4 text-warning" />
                    </div>
                    <span>Grocery List</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Expenses */}
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display">Recent Expenses</CardTitle>
              <Link to="/calendar">
                <Button variant="ghost" size="sm" className="text-primary">
                  View All
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : summary.recentExpenses.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingDown className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No expenses yet this month</p>
                  <Button
                    onClick={() => setAddExpenseOpen(true)}
                    variant="link"
                    className="mt-2 text-primary"
                  >
                    Add your first expense
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {summary.recentExpenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            expense.expense_type === 'personal'
                              ? 'bg-primary/10'
                              : 'bg-accent'
                          }`}
                        >
                          {expense.expense_type === 'personal' ? (
                            <Wallet className="h-4 w-4 text-primary" />
                          ) : (
                            <Users className="h-4 w-4 text-accent-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{expense.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(expense.expense_date), 'dd MMM')}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold">
                        ₹{Number(expense.amount).toLocaleString('en-IN')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AddExpenseDialog
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
        onSuccess={fetchSummary}
      />
    </DashboardLayout>
  );
}
