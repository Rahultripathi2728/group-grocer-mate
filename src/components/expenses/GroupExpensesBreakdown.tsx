import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt,
  User,
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  CheckCircle2,
  History,
  Users,
  Wallet,
  IndianRupee,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getCategoryById } from '@/lib/categories';

interface Member {
  user_id: string;
  full_name: string;
}

interface GroupExpense {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  category: string | null;
  user_id: string;
  created_at: string;
}

interface MemberSpending {
  member: Member;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
  expenses: GroupExpense[];
}

interface Balance {
  from_user: Member;
  to_user: Member;
  amount: number;
}

interface Settlement {
  id: string;
  settled_at: string;
  settled_by: string;
  notes: string | null;
  total_amount?: number;
  settled_by_name?: string;
}

interface Props {
  groupId: string;
  groupName: string;
  onSettle: () => void;
  settling: boolean;
}

export default function GroupExpensesBreakdown({ groupId, groupName, onSettle, settling }: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [memberSpending, setMemberSpending] = useState<MemberSpending[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSettlement, setLastSettlement] = useState<Settlement | null>(null);
  const [expandedSettlement, setExpandedSettlement] = useState<string | null>(null);
  const [settlementExpenses, setSettlementExpenses] = useState<Record<string, GroupExpense[]>>({});
  const [loadingSettlementDetail, setLoadingSettlementDetail] = useState<string | null>(null);

  const fetchData = async () => {
    if (!groupId) return;
    setLoading(true);

    // Fetch group members
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('user_id, profiles(full_name)')
      .eq('group_id', groupId);

    const { data: group } = await supabase
      .from('groups')
      .select('owner_id, profiles(full_name)')
      .eq('id', groupId)
      .single();

    const memberList: Member[] = [];

    // Always add the owner to the member list regardless of profile data
    if (group) {
      memberList.push({
        user_id: group.owner_id,
        full_name: (group.profiles as any)?.full_name || 'Unknown',
      });
    }

    memberships?.forEach((m: any) => {
      if (m.user_id !== group?.owner_id) {
        memberList.push({
          user_id: m.user_id,
          full_name: m.profiles?.full_name || 'Unknown',
        });
      }
    });

    setMembers(memberList);

    // Fetch settlement history
    const { data: settlementData } = await supabase
      .from('settlements')
      .select('*, profiles:settled_by(full_name)')
      .eq('group_id', groupId)
      .order('settled_at', { ascending: false })
      .limit(10);

    const formattedSettlements = (settlementData || []).map((s: any) => ({
      ...s,
      total_amount: Number(s.total_amount) || 0,
      settled_by_name: s.profiles?.full_name || 'Unknown',
    }));

    setSettlements(formattedSettlements);
    const lastSettlementData = formattedSettlements[0] || null;
    setLastSettlement(lastSettlementData);

    // Fetch only expenses AFTER last settlement (post-settlement expenses)
    const lastSettlementDate = formattedSettlements[0]?.settled_at || null;
    
    let query = supabase
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .eq('expense_type', 'group')
      .order('expense_date', { ascending: false });

    // If there's a last settlement, only fetch expenses created after it
    if (lastSettlementDate) {
      query = query.gt('created_at', lastSettlementDate);
    }

    const { data: postSettlementData } = await query;

    const postSettlementExpenses = (postSettlementData || []).map((e) => ({
      ...e,
      amount: Number(e.amount),
    }));

    setExpenses(postSettlementExpenses);

    // Calculate member spending using only post-settlement expenses
    calculateMemberSpending(memberList, postSettlementExpenses);
    // Calculate balances using only post-settlement expenses
    calculateBalances(memberList, postSettlementExpenses);

    setLoading(false);
  };

  const calculateMemberSpending = (memberList: Member[], expenseList: GroupExpense[]) => {
    const memberCount = memberList.length;
    const totalExpense = expenseList.reduce((sum, e) => sum + e.amount, 0);
    const sharePerPerson = memberCount > 0 ? totalExpense / memberCount : 0;

    const spending: MemberSpending[] = memberList.map((member) => {
      const memberExpenses = expenseList.filter((e) => e.user_id === member.user_id);
      const totalPaid = memberExpenses.reduce((sum, e) => sum + e.amount, 0);
      const netBalance = totalPaid - sharePerPerson;

      return {
        member,
        totalPaid,
        totalOwed: sharePerPerson,
        netBalance,
        expenses: memberExpenses,
      };
    });

    // Sort by total paid (descending)
    spending.sort((a, b) => b.totalPaid - a.totalPaid);
    setMemberSpending(spending);
  };

  const calculateBalances = (memberList: Member[], expenseList: GroupExpense[]) => {
    if (!expenseList.length || memberList.length < 2) {
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

    expenseList.forEach((expense) => {
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

    let i = 0, j = 0;
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

  const fetchSettlementDetail = async (settlementId: string, settlementIndex: number) => {
    if (expandedSettlement === settlementId) {
      setExpandedSettlement(null);
      return;
    }

    // Already fetched
    if (settlementExpenses[settlementId]) {
      setExpandedSettlement(settlementId);
      return;
    }

    setLoadingSettlementDetail(settlementId);
    setExpandedSettlement(settlementId);

    const currentSettlement = settlements[settlementIndex];
    const previousSettlement = settlements[settlementIndex + 1] || null;

    // Fetch expenses created between previous settlement and this settlement
    let query = supabase
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .eq('expense_type', 'group')
      .lte('created_at', currentSettlement.settled_at)
      .order('expense_date', { ascending: false });

    if (previousSettlement) {
      query = query.gt('created_at', previousSettlement.settled_at);
    }

    const { data } = await query;
    const expenseList = (data || []).map((e) => ({
      ...e,
      amount: Number(e.amount),
    }));

    setSettlementExpenses((prev) => ({ ...prev, [settlementId]: expenseList }));
    setLoadingSettlementDetail(null);
  };

  useEffect(() => {
    fetchData();
  }, [groupId]);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const perPersonShare = members.length > 0 ? totalExpenses / members.length : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted/50 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Group Summary Header */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-primary/10 to-primary/5 overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-primary/20">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold">{groupName}</h2>
              <p className="text-sm text-muted-foreground">
                {members.length} members • {expenses.length} expenses since last settlement
              </p>
            </div>
          </div>

          {lastSettlement && (
            <div className="mb-4 p-3 rounded-xl bg-success/10 border border-success/20 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
              <p className="text-sm">
                <span className="font-medium text-success">Last Settlement:</span>{' '}
                <span className="text-foreground font-semibold">
                  {format(new Date(lastSettlement.settled_at), 'dd MMM yyyy, hh:mm a')}
                </span>
                {' '}by {lastSettlement.settled_by_name}
                {lastSettlement.total_amount > 0 && (
                  <span className="text-muted-foreground"> • ₹{lastSettlement.total_amount.toLocaleString('en-IN')}</span>
                )}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground mb-1">Total Since Settlement</p>
              <p className="text-2xl font-display font-bold">₹{totalExpenses.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground mb-1">Per Person Share</p>
              <p className="text-2xl font-display font-bold">₹{perPersonShare.toFixed(0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Member-wise Spending Breakdown */}
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Who Spent How Much
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memberSpending.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No expenses yet in this group
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-3">
              {memberSpending.map((ms, index) => (
                <AccordionItem
                  key={ms.member.user_id}
                  value={ms.member.user_id}
                  className="border rounded-xl overflow-hidden bg-muted/30"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                    <div className="flex items-center justify-between w-full pr-2">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center",
                          ms.netBalance > 0 
                            ? "bg-gradient-to-br from-success/30 to-success/10" 
                            : ms.netBalance < 0 
                              ? "bg-gradient-to-br from-destructive/30 to-destructive/10"
                              : "bg-gradient-to-br from-muted to-muted/50"
                        )}>
                          <span className={cn(
                            "text-sm font-bold",
                            ms.netBalance > 0 ? "text-success" : ms.netBalance < 0 ? "text-destructive" : "text-muted-foreground"
                          )}>
                            {ms.member.full_name[0]?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div className="text-left">
                          <p className="font-semibold">
                            {ms.member.full_name}
                            {ms.member.user_id === user?.id && (
                              <span className="text-muted-foreground ml-1 text-sm">(You)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Paid ₹{ms.totalPaid.toFixed(0)} • Share ₹{ms.totalOwed.toFixed(0)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-bold text-lg",
                          ms.netBalance > 0 ? "text-success" : ms.netBalance < 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {ms.netBalance > 0 
                            ? `+₹${ms.netBalance.toFixed(0)}` 
                            : ms.netBalance < 0 
                              ? `-₹${Math.abs(ms.netBalance).toFixed(0)}`
                              : '₹0'}
                        </p>
                        <p className={cn(
                          "text-xs",
                          ms.netBalance > 0 ? "text-success" : ms.netBalance < 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {ms.netBalance > 0 
                            ? 'Gets back' 
                            : ms.netBalance < 0 
                              ? 'Needs to pay'
                              : 'Settled'}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {ms.expenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No expenses added</p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {ms.expenses.map((expense) => {
                          const categoryInfo = getCategoryById(expense.category || 'general');
                          const IconComponent = categoryInfo.icon;
                          return (
                            <motion.div
                              key={expense.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center justify-between p-3 rounded-lg bg-background/50"
                            >
                              <div className="flex items-center gap-3">
                                <div className={cn("p-2 rounded-lg", categoryInfo.bgColor)}>
                                  <IconComponent className={cn("h-4 w-4", categoryInfo.color)} />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{expense.description}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(expense.expense_date), 'dd MMM yyyy')}
                                  </p>
                                </div>
                              </div>
                              <p className="font-semibold">₹{expense.amount.toFixed(0)}</p>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Who Pays Whom */}
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="font-display flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            Who Pays Whom
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
                        <p className="text-xs text-muted-foreground">pays</p>
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
            onClick={onSettle}
            disabled={settling}
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            {settling ? 'Settling...' : 'Mark All as Settled'}
          </Button>
        </motion.div>
      )}

      {/* Settlement History */}
      {settlements.length > 0 && (
        <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Settlement History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {settlements.map((settlement, index) => {
                const isExpanded = expandedSettlement === settlement.id;
                const detailExpenses = settlementExpenses[settlement.id] || [];
                const isLoadingDetail = loadingSettlementDetail === settlement.id;
                const memberCount = members.length;
                const settlementTotal = detailExpenses.reduce((sum, e) => sum + e.amount, 0);
                const sharePerPerson = memberCount > 0 ? settlementTotal / memberCount : 0;

                return (
                  <div key={settlement.id}>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer",
                        isExpanded && "bg-muted/50 rounded-b-none"
                      )}
                      onClick={() => fetchSettlementDetail(settlement.id, index)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-success/10">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            Settled by {settlement.settled_by_name}
                            {settlement.settled_by === user?.id && (
                              <span className="text-muted-foreground ml-1">(You)</span>
                            )}
                          </p>
                          {settlement.total_amount > 0 && (
                            <p className="text-sm font-bold text-success">
                              ₹{settlement.total_amount.toLocaleString('en-IN')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {format(new Date(settlement.settled_at), 'dd MMM yyyy')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isExpanded ? 'Tap to close' : 'Tap for details'}
                        </p>
                      </div>
                    </motion.div>

                    {/* Expanded Detail */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden rounded-b-xl border border-t-0 border-muted/50 bg-background/50"
                        >
                          <div className="p-4 space-y-4">
                            {isLoadingDetail ? (
                              <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                  <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
                                ))}
                              </div>
                            ) : detailExpenses.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">No expense details found</p>
                            ) : (
                              <>
                                {/* Summary */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="p-3 rounded-lg bg-muted/30">
                                    <p className="text-xs text-muted-foreground">Total Expenses</p>
                                    <p className="text-lg font-bold">₹{settlementTotal.toLocaleString('en-IN')}</p>
                                  </div>
                                  <div className="p-3 rounded-lg bg-muted/30">
                                    <p className="text-xs text-muted-foreground">Per Person Share</p>
                                    <p className="text-lg font-bold">₹{sharePerPerson.toFixed(0)}</p>
                                  </div>
                                </div>

                                {/* Member Contributions */}
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    Who Paid How Much
                                  </p>
                                  <div className="space-y-2">
                                    {members.map((member) => {
                                      const memberPaid = detailExpenses
                                        .filter((e) => e.user_id === member.user_id)
                                        .reduce((sum, e) => sum + e.amount, 0);
                                      const net = memberPaid - sharePerPerson;
                                      return (
                                        <div key={member.user_id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                                          <div className="flex items-center gap-2">
                                            <div className={cn(
                                              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold",
                                              net > 0.01 ? "bg-success/20 text-success" : net < -0.01 ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"
                                            )}>
                                              {member.full_name[0]?.toUpperCase()}
                                            </div>
                                            <div>
                                              <p className="text-sm font-medium">
                                                {member.full_name}
                                                {member.user_id === user?.id && <span className="text-muted-foreground text-xs ml-1">(You)</span>}
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                Paid ₹{memberPaid.toFixed(0)} • Share ₹{sharePerPerson.toFixed(0)}
                                              </p>
                                            </div>
                                          </div>
                                          <p className={cn(
                                            "text-sm font-bold",
                                            net > 0.01 ? "text-success" : net < -0.01 ? "text-destructive" : "text-muted-foreground"
                                          )}>
                                            {net > 0.01 ? `+₹${net.toFixed(0)}` : net < -0.01 ? `-₹${Math.abs(net).toFixed(0)}` : '₹0'}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Expense List */}
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    Expenses ({detailExpenses.length})
                                  </p>
                                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                    {detailExpenses.map((expense) => {
                                      const payer = members.find((m) => m.user_id === expense.user_id);
                                      return (
                                        <div key={expense.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20">
                                          <div>
                                            <p className="text-sm font-medium">{expense.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {format(new Date(expense.expense_date), 'dd MMM yyyy')} • by {payer?.full_name || 'Unknown'}
                                            </p>
                                          </div>
                                          <p className="text-sm font-semibold">₹{expense.amount.toFixed(0)}</p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
