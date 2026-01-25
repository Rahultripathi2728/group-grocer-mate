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
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import StatCard from '@/components/ui/stat-card';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import { motion } from 'framer-motion';

interface ExpenseSummary {
  totalPersonal: number;
  totalGroup: number;
  recentExpenses: Array<{
    id: string;
    description: string;
    amount: number;
    expense_date: string;
    expense_type: string;
    category?: string | null;
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
        recentExpenses: expenses.slice(0, 5).map((e) => ({
          ...e,
          amount: Number(e.amount),
        })),
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchSummary();
  }, [user]);

  const quickActions = [
    {
      to: '/calendar',
      icon: Calendar,
      label: 'View Calendar',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      to: '/groups',
      icon: Users,
      label: 'Manage Groups',
      color: 'text-accent-foreground',
      bgColor: 'bg-accent',
    },
    {
      to: '/grocery',
      icon: ShoppingCart,
      label: 'Grocery List',
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      to: '/settlement',
      icon: CheckCircle2,
      label: 'Settlement',
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
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-display font-bold"
            >
              Dashboard
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-muted-foreground mt-1"
            >
              {format(new Date(), 'MMMM yyyy')} Overview
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Button
              onClick={() => setAddExpenseOpen(true)}
              className="gradient-primary text-primary-foreground shadow-glow-sm hover:shadow-glow transition-all duration-300 hover:scale-105"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </motion.div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <StatCard
              title="Personal Expenses"
              value={`₹${summary.totalPersonal.toLocaleString('en-IN')}`}
              icon={Wallet}
              iconColor="text-primary"
              iconBgColor="bg-primary/10"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <StatCard
              title="Group Expenses"
              value={`₹${summary.totalGroup.toLocaleString('en-IN')}`}
              icon={Users}
              iconColor="text-accent-foreground"
              iconBgColor="bg-accent"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <StatCard
              title="Total This Month"
              value={`₹${(summary.totalPersonal + summary.totalGroup).toLocaleString('en-IN')}`}
              icon={TrendingUp}
              iconColor="text-success"
              iconBgColor="bg-success/10"
            />
          </motion.div>
        </div>

        {/* Quick Actions & Recent Expenses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm h-full">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickActions.map((action, i) => (
                  <motion.div
                    key={action.to}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                  >
                    <Link to={action.to}>
                      <Button
                        variant="outline"
                        className="w-full justify-between h-14 group border-border/50 hover:border-primary/30 hover:bg-primary/5"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${action.bgColor} transition-transform duration-300 group-hover:scale-110`}>
                            <action.icon className={`h-4 w-4 ${action.color}`} />
                          </div>
                          <span className="font-medium">{action.label}</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                      </Button>
                    </Link>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Expenses */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display">Recent Expenses</CardTitle>
                <Link to="/calendar">
                  <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                    View All
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-muted/50 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : summary.recentExpenses.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex p-4 rounded-full bg-muted/50 mb-4">
                      <TrendingDown className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground mb-4">No expenses yet this month</p>
                    <Button
                      onClick={() => setAddExpenseOpen(true)}
                      variant="outline"
                      className="text-primary border-primary/30"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add your first expense
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summary.recentExpenses.map((expense, i) => (
                      <motion.div
                        key={expense.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.05 }}
                      >
                        <ExpenseCard {...expense} showDate compact />
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
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
