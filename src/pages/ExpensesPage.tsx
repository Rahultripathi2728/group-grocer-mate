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
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import BudgetCard from '@/components/expenses/BudgetCard';
import StatCard from '@/components/ui/stat-card';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

interface Group {
  id: string;
  name: string;
  owner_id: string;
}

interface Member {
  user_id: string;
  full_name: string;
  email: string;
}

interface Balance {
  from_user: Member;
  to_user: Member;
  amount: number;
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'personal' | 'settlement'>('personal');
  const [summary, setSummary] = useState<ExpenseSummary>({
    totalPersonal: 0,
    totalGroup: 0,
    recentExpenses: [],
  });
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  // Settlement state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [lastSettlement, setLastSettlement] = useState<{ settled_at: string } | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settling, setSettling] = useState(false);

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

  const fetchSettlementData = async (groupId: string) => {
    if (!groupId) return;
    setSettlementLoading(true);

    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('user_id, profiles(full_name, email)')
      .eq('group_id', groupId);

    const { data: group } = await supabase
      .from('groups')
      .select('owner_id, profiles(full_name, email)')
      .eq('id', groupId)
      .single();

    const memberList: Member[] = [];

    if (group?.profiles) {
      memberList.push({
        user_id: group.owner_id,
        full_name: (group.profiles as any).full_name || 'Unknown',
        email: (group.profiles as any).email || '',
      });
    }

    memberships?.forEach((m: any) => {
      if (m.user_id !== group?.owner_id) {
        memberList.push({
          user_id: m.user_id,
          full_name: m.profiles?.full_name || 'Unknown',
          email: m.profiles?.email || '',
        });
      }
    });

    setMembers(memberList);

    const { data: settlements } = await supabase
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('settled_at', { ascending: false })
      .limit(1);

    const lastSettlementData = settlements?.[0] || null;
    setLastSettlement(lastSettlementData);

    await calculateBalances(groupId, memberList, lastSettlementData?.settled_at);
    setSettlementLoading(false);
  };

  const calculateBalances = async (
    groupId: string,
    memberList: Member[],
    sinceDate?: string
  ) => {
    let query = supabase
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .eq('expense_type', 'group')
      .eq('is_settled', false);

    if (sinceDate) {
      query = query.gte('created_at', sinceDate);
    }

    const { data: expenses } = await query;

    if (!expenses || expenses.length === 0) {
      setBalances([]);
      return;
    }

    const memberCount = memberList.length;
    const paidByUser: Record<string, number> = {};
    const owedByUser: Record<string, number> = {};

    memberList.forEach((m) => {
      paidByUser[m.user_id] = 0;
      owedByUser[m.user_id] = 0;
    });

    expenses.forEach((expense) => {
      const payerId = expense.user_id;
      const sharePerPerson = expense.amount / memberCount;

      if (paidByUser[payerId] !== undefined) {
        paidByUser[payerId] += expense.amount;
      }

      memberList.forEach((m) => {
        owedByUser[m.user_id] += sharePerPerson;
      });
    });

    const netBalance: Record<string, number> = {};
    memberList.forEach((m) => {
      netBalance[m.user_id] = paidByUser[m.user_id] - owedByUser[m.user_id];
    });

    const debtors: { user: Member; amount: number }[] = [];
    const creditors: { user: Member; amount: number }[] = [];

    memberList.forEach((m) => {
      const balance = netBalance[m.user_id];
      if (balance < -0.01) {
        debtors.push({ user: m, amount: Math.abs(balance) });
      } else if (balance > 0.01) {
        creditors.push({ user: m, amount: balance });
      }
    });

    const newBalances: Balance[] = [];

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    let i = 0,
      j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const transferAmount = Math.min(debtor.amount, creditor.amount);

      if (transferAmount > 0.01) {
        newBalances.push({
          from_user: debtor.user,
          to_user: creditor.user,
          amount: transferAmount,
        });
      }

      debtor.amount -= transferAmount;
      creditor.amount -= transferAmount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    setBalances(newBalances);
  };

  const handleSettleAll = async () => {
    if (!user || !selectedGroupId) return;

    setSettling(true);

    try {
      const { error: expenseError } = await supabase
        .from('expenses')
        .update({ is_settled: true, settled_at: new Date().toISOString() })
        .eq('group_id', selectedGroupId)
        .eq('is_settled', false);

      if (expenseError) throw expenseError;

      const { error: settlementError } = await supabase.from('settlements').insert({
        group_id: selectedGroupId,
        settled_by: user.id,
        notes: `Settled all expenses as of ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
      });

      if (settlementError) throw settlementError;

      toast.success('All expenses settled!');

      setBalances([]);
      setLastSettlement({
        settled_at: new Date().toISOString(),
      });
    } catch (error) {
      toast.error('Failed to settle expenses');
    }

    setSettling(false);
  };

  useEffect(() => {
    fetchSummary();
    fetchGroups();
  }, [user]);

  useEffect(() => {
    if (selectedGroupId && activeTab === 'settlement') {
      fetchSettlementData(selectedGroupId);
    }
  }, [selectedGroupId, activeTab]);

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
            {format(new Date(), 'MMMM yyyy')} Overview
          </motion.p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'personal' | 'settlement')}>
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-xl">
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
                  title="Group"
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

            {/* Recent Expenses */}
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
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

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Link to="/calendar">
                <Button
                  variant="outline"
                  className="w-full h-14 justify-start gap-3 border-border/50 hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-medium">Calendar</span>
                </Button>
              </Link>
              <Link to="/groups">
                <Button
                  variant="outline"
                  className="w-full h-14 justify-start gap-3 border-border/50 hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="p-2 rounded-xl bg-accent">
                    <Users className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <span className="font-medium">Groups</span>
                </Button>
              </Link>
            </div>
          </TabsContent>

          {/* Settlement Tab */}
          <TabsContent value="settlement" className="mt-6 space-y-6">
            {/* Group Selector */}
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
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

                  {lastSettlement && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2.5 rounded-xl">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Last settled: {format(new Date(lastSettlement.settled_at), 'dd MMM yyyy')}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {groups.length === 0 ? (
              <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
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
            ) : settlementLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* Balances */}
                <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm overflow-hidden">
                  <CardHeader className="border-b border-border/50">
                    <CardTitle className="font-display flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-primary" />
                      Outstanding Balances
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <AnimatePresence mode="wait">
                      {balances.length === 0 ? (
                        <motion.div
                          key="settled"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="text-center py-12"
                        >
                          <div className="inline-flex p-4 rounded-full bg-success/10 mb-4">
                            <CheckCircle2 className="h-10 w-10 text-success" />
                          </div>
                          <p className="text-xl font-display font-semibold text-success">
                            All settled up!
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            No outstanding balances in this group
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="balances"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="space-y-4"
                        >
                          {balances.map((balance, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.1 }}
                              className="flex flex-col sm:flex-row items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-muted/50 to-muted/30 hover:from-muted/70 hover:to-muted/50 transition-colors gap-4"
                            >
                              {/* Debtor */}
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-destructive/30 to-destructive/10 flex items-center justify-center">
                                  <span className="text-sm font-bold text-destructive">
                                    {balance.from_user.full_name[0]?.toUpperCase() || 'U'}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-semibold">
                                    {balance.from_user.full_name}
                                    {balance.from_user.user_id === user?.id && (
                                      <span className="text-muted-foreground ml-1 text-sm">(You)</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">owes</p>
                                </div>
                              </div>

                              {/* Amount */}
                              <div className="flex items-center gap-3">
                                <ArrowRight className="h-5 w-5 text-muted-foreground hidden sm:block" />
                                <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
                                  <p className="text-xl font-display font-bold text-primary">
                                    ₹{balance.amount.toFixed(0)}
                                  </p>
                                </div>
                                <ArrowRight className="h-5 w-5 text-muted-foreground hidden sm:block" />
                              </div>

                              {/* Creditor */}
                              <div className="flex items-center gap-3">
                                <div className="text-right sm:text-left">
                                  <p className="font-semibold">
                                    {balance.to_user.full_name}
                                    {balance.to_user.user_id === user?.id && (
                                      <span className="text-muted-foreground ml-1 text-sm">(You)</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">receives</p>
                                </div>
                                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-success/30 to-success/10 flex items-center justify-center">
                                  <span className="text-sm font-bold text-success">
                                    {balance.to_user.full_name[0]?.toUpperCase() || 'U'}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>

                {/* Settle Button */}
                {balances.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <Button
                      size="lg"
                      className="gradient-primary text-primary-foreground shadow-glow px-10 py-6 text-lg hover:scale-105 transition-transform"
                      onClick={handleSettleAll}
                      disabled={settling}
                    >
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      {settling ? 'Settling...' : 'Mark All as Settled'}
                    </Button>
                  </motion.div>
                )}

                {/* Members Summary */}
                <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="font-display text-lg flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Group Members ({members.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {members.map((member, i) => (
                        <motion.div
                          key={member.user_id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">
                              {member.full_name[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            {member.full_name}
                            {member.user_id === user?.id && (
                              <span className="text-muted-foreground ml-1">(You)</span>
                            )}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating Action Button */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', bounce: 0.4 }}
        className="fixed bottom-24 right-4 z-50"
      >
        <Button
          onClick={() => setAddExpenseOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full gradient-primary text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 hover:scale-110"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </motion.div>

      <AddExpenseDialog
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
        onSuccess={fetchSummary}
      />
    </DashboardLayout>
  );
}
