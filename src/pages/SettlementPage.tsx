import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle2,
  Users,
  Wallet,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';

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

interface Settlement {
  id: string;
  settled_at: string;
  notes: string | null;
}

export default function SettlementPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [lastSettlement, setLastSettlement] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState(false);

  // Fetch user's groups
  useEffect(() => {
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

    fetchGroups();
  }, [user]);

  // Fetch members and calculate balances when group changes
  useEffect(() => {
    if (!selectedGroupId) return;

    const fetchGroupData = async () => {
      setLoading(true);

      // Fetch members
      const { data: memberships } = await supabase
        .from('group_memberships')
        .select('user_id, profiles(full_name, email)')
        .eq('group_id', selectedGroupId);

      const { data: group } = await supabase
        .from('groups')
        .select('owner_id, profiles(full_name, email)')
        .eq('id', selectedGroupId)
        .single();

      const memberList: Member[] = [];

      // Add owner
      if (group?.profiles) {
        memberList.push({
          user_id: group.owner_id,
          full_name: (group.profiles as any).full_name || 'Unknown',
          email: (group.profiles as any).email || '',
        });
      }

      // Add other members
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

      // Fetch last settlement
      const { data: settlements } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', selectedGroupId)
        .order('settled_at', { ascending: false })
        .limit(1);

      const lastSettlementData = settlements?.[0] || null;
      setLastSettlement(lastSettlementData);

      // Calculate balances from expenses since last settlement
      await calculateBalances(selectedGroupId, memberList, lastSettlementData?.settled_at);

      setLoading(false);
    };

    fetchGroupData();
  }, [selectedGroupId]);

  const calculateBalances = async (
    groupId: string,
    memberList: Member[],
    sinceDate?: string
  ) => {
    // Get all group expenses since last settlement
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

    // Calculate what each person paid vs what they owe
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

      // Track what payer paid
      if (paidByUser[payerId] !== undefined) {
        paidByUser[payerId] += expense.amount;
      }

      // Track what each person owes (their share)
      memberList.forEach((m) => {
        owedByUser[m.user_id] += sharePerPerson;
      });
    });

    // Calculate net balance (positive = owed money, negative = owes money)
    const netBalance: Record<string, number> = {};
    memberList.forEach((m) => {
      netBalance[m.user_id] = paidByUser[m.user_id] - owedByUser[m.user_id];
    });

    // Calculate who owes whom using min-transfers algorithm
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

    // Match debtors to creditors
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

  const handleSettleAll = async () => {
    if (!user || !selectedGroupId) return;

    setSettling(true);

    try {
      // Mark all unsettled expenses as settled
      const { error: expenseError } = await supabase
        .from('expenses')
        .update({ is_settled: true, settled_at: new Date().toISOString() })
        .eq('group_id', selectedGroupId)
        .eq('is_settled', false);

      if (expenseError) throw expenseError;

      // Create settlement record
      const { error: settlementError } = await supabase
        .from('settlements')
        .insert({
          group_id: selectedGroupId,
          settled_by: user.id,
          notes: `Settled all expenses as of ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
        });

      if (settlementError) throw settlementError;

      toast.success('All expenses settled!');
      
      // Refresh data
      setBalances([]);
      setLastSettlement({
        id: 'new',
        settled_at: new Date().toISOString(),
        notes: null,
      });
    } catch (error) {
      toast.error('Failed to settle expenses');
    }

    setSettling(false);
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold">Settlement</h1>
          <p className="text-muted-foreground mt-1">
            Track who owes whom and settle expenses
          </p>
        </div>

        {/* Group Selector */}
        <Card className="border-0 shadow-md">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Select Group
                </label>
                <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {group.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {lastSettlement && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-2 rounded-lg">
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
          <Card className="border-0 shadow-md">
            <CardContent className="pt-8 pb-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">No groups found</p>
              <p className="text-sm text-muted-foreground">
                Create or join a group to start tracking settlements
              </p>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Balances */}
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Outstanding Balances
                </CardTitle>
              </CardHeader>
              <CardContent>
                {balances.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
                    <p className="text-lg font-medium text-success">All settled up!</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      No outstanding balances in this group
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {balances.map((balance, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                            <span className="text-sm font-semibold text-destructive">
                              {balance.from_user.full_name[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">
                              {balance.from_user.full_name}
                              {balance.from_user.user_id === user?.id && (
                                <span className="text-muted-foreground ml-1">(You)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">owes</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <ArrowRight className="h-5 w-5 text-muted-foreground" />
                          <div className="text-center">
                            <p className="text-lg font-bold text-primary">
                              ₹{balance.amount.toFixed(2)}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground" />
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-medium">
                              {balance.to_user.full_name}
                              {balance.to_user.user_id === user?.id && (
                                <span className="text-muted-foreground ml-1">(You)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">receives</p>
                          </div>
                          <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                            <span className="text-sm font-semibold text-success">
                              {balance.to_user.full_name[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Settle Button */}
            {balances.length > 0 && (
              <div className="flex justify-center">
                <Button
                  size="lg"
                  className="gradient-primary text-primary-foreground shadow-glow px-8"
                  onClick={handleSettleAll}
                  disabled={settling}
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  {settling ? 'Settling...' : 'Mark All as Settled'}
                </Button>
              </div>
            )}

            {/* Members Summary */}
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="font-display text-lg">
                  Group Members ({members.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted/50"
                    >
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-semibold text-primary">
                          {member.full_name[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {member.full_name}
                        {member.user_id === user?.id && ' (You)'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
