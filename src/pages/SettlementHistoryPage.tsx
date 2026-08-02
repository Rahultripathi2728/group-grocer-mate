import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ChevronLeft, CheckCircle2, History } from 'lucide-react';
import { motion } from 'framer-motion';

interface SettlementRow {
  id: string;
  group_id: string;
  settled_at: string;
  total_amount: number;
  notes: string | null;
  settled_by: string;
  settled_by_name: string;
  group_name: string;
}

export default function SettlementHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string>(searchParams.get('group') || 'all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'highest'>('newest');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('settlements')
        .select('*, profiles:settled_by(full_name), groups(name)')
        .order('settled_at', { ascending: false });

      const mapped: SettlementRow[] = ((data || []) as Array<Record<string, unknown>>).map((s) => ({
        id: s.id as string,
        group_id: s.group_id as string,
        settled_at: s.settled_at as string,
        total_amount: Number(s.total_amount) || 0,
        notes: (s.notes as string) ?? null,
        settled_by: s.settled_by as string,
        settled_by_name:
          ((s.profiles as { full_name?: string } | null)?.full_name) || 'Unknown',
        group_name: ((s.groups as { name?: string } | null)?.name) || 'Group',
      }));
      setRows(mapped);
      setLoading(false);
    };
    load();
  }, [user]);

  const groupOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.group_id, r.group_name));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);

  const monthOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const d = new Date(r.settled_at);
      map.set(format(d, 'yyyy-MM'), format(d, 'MMMM yyyy'));
    });
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows.filter((r) => {
      if (groupFilter !== 'all' && r.group_id !== groupFilter) return false;
      if (monthFilter !== 'all' && format(new Date(r.settled_at), 'yyyy-MM') !== monthFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortOrder === 'highest') return b.total_amount - a.total_amount;
      const diff = new Date(a.settled_at).getTime() - new Date(b.settled_at).getTime();
      return sortOrder === 'oldest' ? diff : -diff;
    });
    return list;
  }, [rows, groupFilter, monthFilter, sortOrder]);

  const totalSettled = filtered.reduce((sum, r) => sum + r.total_amount, 0);

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold">Settlement History</h1>
            <p className="text-xs text-muted-foreground">
              {filtered.length} settlements · ₹{totalSettled.toLocaleString('en-IN')} total
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groupOptions.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
            <SelectTrigger className="h-9 text-sm col-span-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="highest">Highest amount</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="p-4 rounded-full bg-muted/50 mb-4">
              <History className="h-10 w-10 opacity-40" />
            </div>
            <p className="font-medium">No settlements found</p>
            <p className="text-sm mt-1">Try changing the filters above</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
              >
                <Card className="border border-border shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-success/10 shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {r.group_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          Settled by {r.settled_by === user?.id ? 'You' : r.settled_by_name}
                        </p>
                        {r.notes && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{r.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {r.total_amount > 0 && (
                        <p className="text-sm font-bold">₹{r.total_amount.toLocaleString('en-IN')}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(r.settled_at), 'dd MMM yyyy')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
