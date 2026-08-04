import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  History,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCategoryById } from '@/lib/categories';
import SimplifiedBalances from './SimplifiedBalances';

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

interface Split {
  expense_id: string;
  user_id: string;
  amount_owed: number;
  is_paid: boolean;
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
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<GroupExpense[]>([]);
  const [memberSpending, setMemberSpending] = useState<MemberSpending[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [mySettlement, setMySettlement] = useState<Settlement | null>(null);

  const fetchData = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);

    const [{ data: memberships }, { data: group }, { data: settlementData }] = await Promise.all([
      supabase.from('group_memberships').select('user_id, profiles(full_name)').eq('group_id', groupId),
      supabase.from('groups').select('owner_id, profiles(full_name)').eq('id', groupId).maybeSingle(),
      supabase
        .from('settlements')
        .select('*, profiles:settled_by(full_name)')
        .eq('group_id', groupId)
        .order('settled_at', { ascending: false })
        .limit(10),
    ]);

    const memberList: Member[] = [];
    if (group) {
      memberList.push({
        user_id: (group as any).owner_id,
        full_name: (group as any).profiles?.full_name || 'Unknown',
      });
    }
    memberships?.forEach((m: any) => {
      if (m.user_id !== (group as any)?.owner_id) {
        memberList.push({ user_id: m.user_id, full_name: m.profiles?.full_name || 'Unknown' });
      }
    });
    setMembers(memberList);

    const formattedSettlements = (settlementData || []).map((s: any) => ({
      ...s,
      total_amount: Number(s.total_amount) || 0,
      settled_by_name: s.profiles?.full_name || 'Unknown',
    }));
    setSettlements(formattedSettlements);
    setMySettlement(formattedSettlements.find((s: Settlement) => s.settled_by === user?.id) || null);

    // Everything that is not fully settled yet — per-person dues live in expense_splits
    const { data: expenseData } = await supabase
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .eq('expense_type', 'group')
      .eq('is_settled', false)
      .order('expense_date', { ascending: false });

    const openExpenses = (expenseData || []).map((e) => ({ ...e, amount: Number(e.amount) })) as GroupExpense[];

    let splits: Split[] = [];
    if (openExpenses.length > 0) {
      const { data: splitData } = await supabase
        .from('expense_splits')
        .select('expense_id, user_id, amount_owed, is_paid')
        .in('expense_id', openExpenses.map((e) => e.id));
      splits = (splitData || []).map((s: any) => ({
        expense_id: s.expense_id,
        user_id: s.user_id,
        amount_owed: Number(s.amount_owed),
        is_paid: !!s.is_paid,
      }));
    }

    computeState(memberList, openExpenses, splits);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, user?.id]);

  /**
   * Per-person model: a member's dues are their UNPAID splits.
   * Once a member settles, only their own splits become paid, so their balance
   * goes to zero while everyone else keeps their pending amount.
   */
  const computeState = (
    memberList: Member[],
    expenseList: GroupExpense[],
    splits: Split[],
  ) => {
    const byExpense = new Map<string, Split[]>();
    splits.forEach((s) => {
      const list = byExpense.get(s.expense_id) || [];
      list.push(s);
      byExpense.set(s.expense_id, list);
    });

    const owed: Record<string, number> = {};
    const paidForOthers: Record<string, number> = {};
    const totalPaid: Record<string, number> = {};
    memberList.forEach((m) => {
      owed[m.user_id] = 0;
      paidForOthers[m.user_id] = 0;
      totalPaid[m.user_id] = 0;
    });

    // debtor -> payer -> amount
    const pairs: Record<string, Record<string, number>> = {};
    const stillPending: GroupExpense[] = [];

    expenseList.forEach((e) => {
      let rows = byExpense.get(e.id) || [];
      // Legacy rows without splits: treat as an equal split among all members
      if (rows.length === 0 && memberList.length > 0) {
        const per = e.amount / memberList.length;
        rows = memberList.map((m) => ({
          expense_id: e.id,
          user_id: m.user_id,
          amount_owed: per,
          is_paid: m.user_id === e.user_id,
        }));
      }
      const unpaid = rows.filter((r) => !r.is_paid && r.user_id !== e.user_id && r.amount_owed > 0.001);
      if (unpaid.length === 0) return;

      stillPending.push(e);
      if (totalPaid[e.user_id] !== undefined) totalPaid[e.user_id] += e.amount;

      unpaid.forEach((r) => {
        if (owed[r.user_id] !== undefined) owed[r.user_id] += r.amount_owed;
        if (paidForOthers[e.user_id] !== undefined) paidForOthers[e.user_id] += r.amount_owed;
        pairs[r.user_id] = pairs[r.user_id] || {};
        pairs[r.user_id][e.user_id] = (pairs[r.user_id][e.user_id] || 0) + r.amount_owed;
      });
    });

    setPendingExpenses(stillPending);

    const spending: MemberSpending[] = memberList.map((member) => ({
      member,
      totalPaid: totalPaid[member.user_id] || 0,
      totalOwed: owed[member.user_id] || 0,
      netBalance: (paidForOthers[member.user_id] || 0) - (owed[member.user_id] || 0),
      expenses: stillPending.filter((e) => e.user_id === member.user_id),
    }));
    spending.sort((a, b) => b.totalPaid - a.totalPaid);
    setMemberSpending(spending);

    // Net each pair so A→B and B→A collapse into a single transfer
    const memberMap = new Map(memberList.map((m) => [m.user_id, m]));
    const seen = new Set<string>();
    const result: Balance[] = [];
    Object.entries(pairs).forEach(([debtor, creditors]) => {
      Object.entries(creditors).forEach(([creditor, amount]) => {
        const key = [debtor, creditor].sort().join('|');
        if (seen.has(key)) return;
        seen.add(key);
        const reverse = pairs[creditor]?.[debtor] || 0;
        const net = amount - reverse;
        const from = net >= 0 ? debtor : creditor;
        const to = net >= 0 ? creditor : debtor;
        const value = Math.abs(net);
        if (value < 0.01) return;
        const fromUser = memberMap.get(from);
        const toUser = memberMap.get(to);
        if (!fromUser || !toUser) return;
        result.push({ from_user: fromUser, to_user: toUser, amount: value });
      });
    });
    result.sort((a, b) => b.amount - a.amount);
    setBalances(result);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalExpenses = pendingExpenses.reduce((sum, e) => sum + e.amount, 0);
  const myShare = memberSpending.find((m) => m.member.user_id === user?.id)?.totalOwed || 0;

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
      <Card className="border border-border shadow-sm overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-muted">
              <Users className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold">{groupName}</h2>
              <p className="text-sm text-muted-foreground">
                {members.length} members • {pendingExpenses.length} pending expenses
              </p>
            </div>
          </div>

          {mySettlement && (
            <div className="mb-4 p-3 rounded-xl bg-success/10 border border-success/20 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
              <p className="text-sm">
                <span className="font-medium text-success">You last settled:</span>{' '}
                <span className="text-foreground font-semibold">
                  {format(new Date(mySettlement.settled_at), 'dd MMM yyyy, hh:mm a')}
                </span>
                {(mySettlement.total_amount || 0) > 0 && (
                  <span className="text-muted-foreground"> • ₹{(mySettlement.total_amount || 0).toLocaleString('en-IN')}</span>
                )}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-muted">
              <p className="text-xs text-muted-foreground mb-1">Pending Total</p>
              <p className="text-2xl font-display font-bold">₹{totalExpenses.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted">
              <p className="text-xs text-muted-foreground mb-1">Your Pending Share</p>
              <p className="text-2xl font-display font-bold">₹{myShare.toFixed(0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Member-wise Spending Breakdown */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Wallet className="h-5 w-5 text-foreground" />
            Who Owes How Much
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memberSpending.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No expenses yet in this group
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-3">
              {memberSpending.map((ms) => (
                <AccordionItem
                  key={ms.member.user_id}
                  value={ms.member.user_id}
                  className="border rounded-xl overflow-hidden bg-muted/30"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                    <div className="flex items-center justify-between w-full pr-2">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'h-10 w-10 rounded-full flex items-center justify-center',
                          ms.netBalance > 0.01
                            ? 'bg-success/10'
                            : ms.netBalance < -0.01
                              ? 'bg-destructive/10'
                              : 'bg-muted'
                        )}>
                          <span className={cn(
                            'text-sm font-bold',
                            ms.netBalance > 0.01 ? 'text-success' : ms.netBalance < -0.01 ? 'text-destructive' : 'text-muted-foreground'
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
                            Paid ₹{ms.totalPaid.toFixed(0)} • Pending share ₹{ms.totalOwed.toFixed(0)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'font-bold text-lg',
                          ms.netBalance > 0.01 ? 'text-success' : ms.netBalance < -0.01 ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {ms.netBalance > 0.01
                            ? `+₹${ms.netBalance.toFixed(0)}`
                            : ms.netBalance < -0.01
                              ? `-₹${Math.abs(ms.netBalance).toFixed(0)}`
                              : '₹0'}
                        </p>
                        <p className={cn(
                          'text-xs',
                          ms.netBalance > 0.01 ? 'text-success' : ms.netBalance < -0.01 ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {ms.netBalance > 0.01
                            ? 'Gets back'
                            : ms.netBalance < -0.01
                              ? 'Needs to pay'
                              : 'Settled'}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {ms.expenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No pending expenses paid by this member</p>
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
                                <div className={cn('p-2 rounded-lg', categoryInfo.bgColor)}>
                                  <IconComponent className={cn('h-4 w-4', categoryInfo.color)} />
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

      {/* Simplified Splitwise-style Balances + per-person settle */}
      <SimplifiedBalances
        balances={balances}
        memberSpending={memberSpending}
        onSettle={onSettle}
        settling={settling}
      />

      {/* Settlement History — each row is one person settling their own share */}
      {settlements.length > 0 && (
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Settlement History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {settlements.slice(0, 3).map((settlement, index) => (
                <motion.div
                  key={settlement.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-success/10">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {settlement.settled_by === user?.id
                          ? 'You settled your share'
                          : `${settlement.settled_by_name} settled their share`}
                      </p>
                      {(settlement.total_amount || 0) > 0 && (
                        <p className="text-sm font-bold text-success">
                          ₹{(settlement.total_amount || 0).toLocaleString('en-IN')}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    {format(new Date(settlement.settled_at), 'dd MMM yyyy')}
                    <br />
                    {format(new Date(settlement.settled_at), 'hh:mm a')}
                  </p>
                </motion.div>
              ))}
            </div>
            {settlements.length > 3 && (
              <Button
                variant="outline"
                className="w-full mt-3"
                onClick={() => navigate(`/settlement/history?group=${groupId}`)}
              >
                View all settlements
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
