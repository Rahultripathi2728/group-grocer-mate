import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Sparkles } from 'lucide-react';
import GroupExpensesBreakdown from '@/components/expenses/GroupExpensesBreakdown';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Group { id: string; name: string; owner_id: string }

export default function SettlementPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGroupId = searchParams.get('group');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('settlement_selected_group') || '';
  });
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (selectedGroupId) {
      try { localStorage.setItem('settlement_selected_group', selectedGroupId); } catch {}
    }
  }, [selectedGroupId]);

  const fetchGroups = async () => {
    if (!user) return;
    const [ownedRes, msRes] = await Promise.all([
      supabase.from('groups').select('id, name, owner_id').eq('owner_id', user.id),
      supabase.from('group_memberships').select('group_id, groups(id, name, owner_id)').eq('user_id', user.id),
    ]);
    const memberGroups = (msRes.data || []).map((m: any) => m.groups).filter(Boolean);
    const all = [...(ownedRes.data || []), ...memberGroups];
    const uniq = all.filter((g, i, a) => i === a.findIndex((x: any) => x.id === g.id));
    setGroups(uniq as Group[]);
    setSelectedGroupId((prev) => {
      if (requestedGroupId && uniq.some((g: any) => g.id === requestedGroupId)) return requestedGroupId;
      if (prev && uniq.some((g: any) => g.id === prev)) return prev;
      return uniq.length > 0 ? uniq[0].id : '';
    });
  };

  useEffect(() => { fetchGroups(); }, [user, requestedGroupId]);

  // Once applied, drop the deep-link param so manual selection isn't overridden
  useEffect(() => {
    if (requestedGroupId && selectedGroupId === requestedGroupId) {
      const next = new URLSearchParams(searchParams);
      next.delete('group');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedGroupId, selectedGroupId]);

  const handleSettleAll = async () => {
    if (!user || !selectedGroupId) return;
    setSettling(true);
    try {
      const { data, error } = await supabase.rpc('settle_group_expenses', { p_group_id: selectedGroupId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const count = row?.expenses_settled ?? 0;
      if (!count) { toast.info('No unsettled expenses to settle.'); setSettling(false); return; }
      toast.success(`Settled ${count} expense${count > 1 ? 's' : ''}!`);
      const current = selectedGroupId;
      setSelectedGroupId('');
      setTimeout(() => setSelectedGroupId(current), 100);
    } catch (e) {
      console.error(e);
      toast.error('Failed to settle expenses');
    }
    setSettling(false);
  };

  const initials = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-24">
        <div>
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-2xl sm:text-3xl font-display font-bold">
            Settlement
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-sm text-muted-foreground mt-1">
            Track group balances and settle up
          </motion.p>
        </div>

        {groups.length === 0 ? (
          <Card className="border border-border shadow-sm">
            <CardContent className="pt-12 pb-12 text-center">
              <div className="inline-flex p-6 rounded-full bg-primary/10 mb-6">
                <Users className="h-10 w-10 text-primary" />
              </div>
              <p className="text-muted-foreground mb-2">No groups found</p>
              <p className="text-sm text-muted-foreground">Create or join a group to start tracking settlements</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {groups.map((g) => {
                const active = g.id === selectedGroupId;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroupId(g.id)}
                    className="flex flex-col items-center gap-1 min-w-16"
                  >
                    <div className={cn(
                      'h-14 w-14 rounded-full flex items-center justify-center border-2 transition-all',
                      active ? 'bg-foreground text-background border-foreground' : 'bg-muted text-foreground border-border',
                    )}>
                      <span className="text-sm font-semibold">{initials(g.name)}</span>
                    </div>
                    <span className={cn('text-xs line-clamp-1 max-w-16 text-center', active ? 'font-semibold' : 'text-muted-foreground')}>
                      {g.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedGroupId ? (
              <GroupExpensesBreakdown
                groupId={selectedGroupId}
                groupName={groups.find(g => g.id === selectedGroupId)?.name || ''}
                onSettle={handleSettleAll}
                settling={settling}
              />
            ) : (
              <Card className="border border-border shadow-sm">
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="inline-flex p-6 rounded-full bg-muted/50 mb-6">
                    <Sparkles className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">Select a group to view settlements</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}