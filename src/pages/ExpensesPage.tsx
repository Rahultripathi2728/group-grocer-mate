import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Plus,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  CalendarIcon,
} from 'lucide-react';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import BudgetCard from '@/components/expenses/BudgetCard';
import GroupExpensesBreakdown from '@/components/expenses/GroupExpensesBreakdown';
import StatCard from '@/components/ui/stat-card';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import DailySpendingChart from '@/components/expenses/DailySpendingChart';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  expense_type: string;
  category?: string | null;
  myShare?: number;
}

interface ExpenseSummary {
  totalPersonal: number;
  totalGroup: number;
  recentExpenses: ExpenseRow[];
  allExpenses: ExpenseRow[];
}

interface Group {
  id: string;
  name: string;
  owner_id: string;
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'personal' | 'settlement'>('personal');
  const [summary, setSummary] = useState<ExpenseSummary>({
    totalPersonal: 0,
    totalGroup: 0,
    recentExpenses: [],
    allExpenses: [],
  });
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  // Date filter state - default: 1st of current month to today
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  // Settlement state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [settling, setSettling] = useState(false);

  const fetchSummary = async () => {
    if (!user) return;

    const startDate = format(dateFrom, 'yyyy-MM-dd');
    const endDate = format(dateTo, 'yyyy-MM-dd');

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

      // Get user's share from expense_splits for group expenses in this date range
      const groupExpenseIds = expenses
        .filter((e) => e.expense_type === 'group')
        .map((e) => e.id);

      let myGroupShare = 0;
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
        myGroupShare = (splits || []).reduce((sum, s) => sum + Number(s.amount_owed), 0);
      }

      const mapped = expenses.map((e) => ({
        ...e,
        amount: Number(e.amount),
        myShare: e.expense_type === 'group'
          ? (splitsMap.get(e.id) || 0)
          : Number(e.amount),
      }));
      setSummary({
        totalPersonal: personal,
        totalGroup: myGroupShare,
        recentExpenses: mapped.slice(0, 5),
        allExpenses: mapped,
      });
    }

    setLoading(false);
  };

  const fetchGroups = async () => {
    if (!user) return;

    const { data: ownedGroups } = await supabase
      .from('groups')
      .select('id, name, owner_id')
      .eq('owner_id', user.id);

    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('group_id, groups(id, name, owner_id)')
      .eq('user_id', user.id);

    const memberGroups = memberships?.map((m) => m.groups).filter(Boolean) || [];

    const allGroups = [
      ...(ownedGroups || []),
      ...memberGroups.map((g: any) => g),
    ];

    const uniqueGroups = allGroups.filter(
      (group, index, self) => index === self.findIndex((g) => g.id === group.id)
    );

    setGroups(uniqueGroups);
    if (uniqueGroups.length > 0) {
      setSelectedGroupId(uniqueGroups[0].id);
    }
  };

  const handleSettleAll = async () => {
    if (!user || !selectedGroupId) return;

    setSettling(true);

    try {
      // Fetch unsettled expense IDs and amounts atomically
      const { data: unsettledExpenses } = await supabase
        .from('expenses')
        .select('id, amount')
        .eq('group_id', selectedGroupId)
        .eq('is_settled', false);

      if (!unsettledExpenses || unsettledExpenses.length === 0) {
        toast.info('No unsettled expenses to settle.');
        setSettling(false);
        return;
      }

      const unsettledIds = unsettledExpenses.map((e) => e.id);
      const totalSettledAmount = unsettledExpenses.reduce(
        (sum, e) => sum + Number(e.amount), 0
      );

      // Mark expenses as settled
      const { error: expenseError } = await supabase
        .from('expenses')
        .update({ is_settled: true, settled_at: new Date().toISOString() })
        .in('id', unsettledIds);

      if (expenseError) throw expenseError;

      // Also mark all related expense_splits as paid
      const { error: splitsError } = await supabase
        .from('expense_splits')
        .update({ is_paid: true, paid_at: new Date().toISOString() })
        .in('expense_id', unsettledIds);

      if (splitsError) console.error('Failed to update splits:', splitsError);

      // Record settlement
      const { error: settlementError } = await supabase.from('settlements').insert({
        group_id: selectedGroupId,
        settled_by: user.id,
        total_amount: totalSettledAmount,
        notes: `Settled ₹${totalSettledAmount.toLocaleString('en-IN')} on ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
      });

      if (settlementError) throw settlementError;

      toast.success('All expenses settled!');
      
      // Force a re-render
      const currentGroup = selectedGroupId;
      setSelectedGroupId('');
      setTimeout(() => setSelectedGroupId(currentGroup), 100);
    } catch (error) {
      toast.error('Failed to settle expenses');
    }

    setSettling(false);
  };

  useEffect(() => {
    fetchSummary();
    fetchGroups();
  }, [user, dateFrom, dateTo]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-24">
        {/* Header */}
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-display font-bold"
          >
            Expenses
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground mt-1"
          >
            {format(dateFrom, 'dd MMM')} – {format(dateTo, 'dd MMM yyyy')} Overview
          </motion.p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'personal' | 'settlement')}>
          <TabsList className="grid w-full grid-cols-2 bg-muted p-1 rounded-xl border border-border">
            <TabsTrigger 
              value="personal" 
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Wallet className="h-4 w-4" />
              My Expenses
            </TabsTrigger>
            <TabsTrigger 
              value="settlement" 
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Settlement
            </TabsTrigger>
          </TabsList>

          {/* Personal Expenses Tab */}
          <TabsContent value="personal" className="mt-6 space-y-6">
            {/* Date Range Filter */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 flex-wrap"
            >
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
              <Button
                    variant="outline"
                    className={cn(
                      "flex-1 min-w-[130px] justify-start text-left font-normal border border-border",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {format(dateFrom, 'MM/dd/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(d) => { if (d) { setDateFrom(d); setFromOpen(false); } }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground text-sm font-medium">to</span>

              <Popover open={toOpen} onOpenChange={setToOpen}>
                <PopoverTrigger asChild>
              <Button
                    variant="outline"
                    className={cn(
                      "flex-1 min-w-[130px] justify-start text-left font-normal border border-border",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {format(dateTo, 'MM/dd/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(d) => { if (d) { setDateTo(d); setToOpen(false); } }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </motion.div>

            {/* Budget Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <BudgetCard 
                totalSpent={summary.totalPersonal + summary.totalGroup} 
                onBudgetChange={fetchSummary}
              />
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <StatCard
                  title="Personal"
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
                  title="My Share (Group)"
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
                  title="Total"
                  value={`₹${(summary.totalPersonal + summary.totalGroup).toLocaleString('en-IN')}`}
                  icon={TrendingUp}
                  iconColor="text-success"
                  iconBgColor="bg-success/10"
                />
              </motion.div>
            </div>

            {/* Daily Spending Chart */}
            <DailySpendingChart expenses={summary.allExpenses} dateFrom={dateFrom} dateTo={dateTo} />

            {/* Recent Expenses */}
            <Card className="border border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display">Recent Expenses</CardTitle>
                <Link to="/expenses/all">
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
                    <p className="text-muted-foreground">No expenses yet this month</p>
                    <p className="text-sm text-muted-foreground mt-1">Tap + to add your first expense</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summary.recentExpenses.map((expense, i) => (
                      <motion.div
                        key={expense.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                      >
                        <ExpenseCard {...expense} showDate compact />
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </TabsContent>

          {/* Settlement Tab */}
          <TabsContent value="settlement" className="mt-6 space-y-6">
            {/* Group Selector */}
            <Card className="border border-border shadow-sm">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Select Group
                    </label>
                    <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                      <SelectTrigger className="w-full bg-muted/50 border-0">
                        <SelectValue placeholder="Select a group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              {group.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {groups.length === 0 ? (
              <Card className="border border-border shadow-sm">
                <CardContent className="pt-12 pb-12 text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex p-6 rounded-full bg-primary/10 mb-6"
                  >
                    <Users className="h-10 w-10 text-primary" />
                  </motion.div>
                  <p className="text-muted-foreground mb-2">No groups found</p>
                  <p className="text-sm text-muted-foreground">
                    Create or join a group to start tracking settlements
                  </p>
                </CardContent>
              </Card>
            ) : selectedGroupId ? (
              <GroupExpensesBreakdown
                groupId={selectedGroupId}
                groupName={groups.find(g => g.id === selectedGroupId)?.name || ''}
                onSettle={handleSettleAll}
                settling={settling}
              />
            ) : (
              <Card className="border border-border shadow-sm">
                <CardContent className="pt-12 pb-12 text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex p-6 rounded-full bg-muted/50 mb-6"
                  >
                    <Sparkles className="h-10 w-10 text-muted-foreground" />
                  </motion.div>
                  <p className="text-muted-foreground">Select a group to view settlements</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

      </div>
    </DashboardLayout>
  );
}
