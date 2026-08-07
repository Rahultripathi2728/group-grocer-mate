import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import {
  TrendingUp, TrendingDown, Wallet, Users, ArrowRight,
  CalendarIcon, ChevronLeft, ChevronRight, SlidersHorizontal,
} from 'lucide-react';
import BudgetCard from '@/components/expenses/BudgetCard';
import StatCard from '@/components/ui/stat-card';
import ExpenseCard from '@/components/expenses/ExpenseCard';
import ChartToggle from '@/components/expenses/ChartToggle';
import AnalyticsBreakdownDialog, { BreakdownKind } from '@/components/expenses/AnalyticsBreakdownDialog';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { detectCategory } from '@/lib/categories';
import { parseSplitItems, soloItemsFor, sumItems } from '@/lib/split-items';

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  expense_type: string;
  category?: string | null;
  myShare?: number;
  groupName?: string;
  group_id?: string | null;
  /** How this expense counts in analytics — a group expense paid 100% by you counts as personal */
  analyticsType?: 'personal' | 'group';
  soloPayer?: boolean;
  /** Item names when this row came from an item-wise bill */
  itemNames?: string[];
  /** Who actually paid the bill (group expense counted as your personal spend) */
  paidByName?: string;
}

interface ExpenseSummary {
  totalPersonal: number;
  totalGroup: number;
  recentExpenses: ExpenseRow[];
  allExpenses: ExpenseRow[];
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<ExpenseSummary>({
    totalPersonal: 0, totalGroup: 0, recentExpenses: [], allExpenses: [],
  });
  const [loading, setLoading] = useState(true);
  const [breakdownKind, setBreakdownKind] = useState<BreakdownKind | null>(null);

  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [isCustomRange, setIsCustomRange] = useState(false);

  const goToMonth = (date: Date) => {
    const today = new Date();
    setDateFrom(startOfMonth(date));
    setDateTo(isSameMonth(date, today) ? today : endOfMonth(date));
    setIsCustomRange(false);
  };

  const fetchSummary = async () => {
    if (!user) return;
    const startDate = format(dateFrom, 'yyyy-MM-dd');
    const endDate = format(dateTo, 'yyyy-MM-dd');

    const { data: expenses } = await supabase
      .from('expenses')
      .select('*, groups(name)')
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
      .order('expense_date', { ascending: false });

    if (expenses) {
      const groupExpenseIds = expenses.filter((e) => e.expense_type === 'group').map((e) => e.id);

      // All splits (not just mine) so we can detect "paid 100% by me" group expenses
      const splitsByExpense = new Map<string, Array<{ user_id: string; amount: number }>>();
      if (groupExpenseIds.length > 0) {
        const { data: splits } = await supabase
          .from('expense_splits')
          .select('expense_id, user_id, amount_owed')
          .in('expense_id', groupExpenseIds);
        (splits || []).forEach((s) => {
          const list = splitsByExpense.get(s.expense_id) || [];
          list.push({ user_id: s.user_id, amount: Number(s.amount_owed) });
          splitsByExpense.set(s.expense_id, list);
        });
      }

      // Names of who paid each group bill
      const payerIds = [...new Set(expenses.filter((e) => e.expense_type === 'group').map((e) => e.user_id))];
      const payerNames = new Map<string, string>();
      if (payerIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', payerIds);
        (profs || []).forEach((p) => payerNames.set(p.id, p.full_name || 'Member'));
      }

      const mapped: ExpenseRow[] = expenses.flatMap((e) => {
        const amount = Number(e.amount);
        if (e.expense_type !== 'group') {
          return [{
            ...(e as any),
            amount,
            myShare: amount,
            groupName: (e as any).groups?.name || undefined,
            analyticsType: 'personal' as const,
          }];
        }
        const rows = splitsByExpense.get(e.id) || [];
        const owing = rows.filter((r) => r.amount > 0);
        const myShare = rows.find((r) => r.user_id === user.id)?.amount || 0;
        // Only one person owes and that person is me → effectively a personal expense
        const soloPayer = owing.length === 1 && owing[0].user_id === user.id;
        const groupName = (e as any).groups?.name || undefined;
        const paidByName = e.user_id === user.id ? 'You' : (payerNames.get(e.user_id) || 'Member');

        // Item-wise bill: items only I share are 100% mine → personal spend
        const items = parseSplitItems((e as any).split_items);
        const mySolo = soloItemsFor(items, user.id);
        if (!soloPayer && mySolo.length > 0) {
          const soloTotal = sumItems(mySolo);
          const out: ExpenseRow[] = [{
            ...(e as any),
            id: `${e.id}:solo`,
            amount: soloTotal,
            myShare: soloTotal,
            groupName,
            analyticsType: 'personal' as const,
            soloPayer: true,
            itemNames: mySolo.map((i) => i.name),
            paidByName,
          }];
          const rest = Math.round((myShare - soloTotal) * 100) / 100;
          if (rest > 0.009) {
            out.push({
              ...(e as any),
              amount,
              myShare: rest,
              groupName,
              analyticsType: 'group' as const,
              paidByName,
            });
          }
          return out;
        }

        return [{
          ...(e as any),
          amount,
          myShare,
          groupName,
          analyticsType: soloPayer ? ('personal' as const) : ('group' as const),
          soloPayer,
          paidByName: soloPayer ? paidByName : undefined,
        }];
      });

      const totalPersonal = mapped
        .filter((e) => e.analyticsType === 'personal')
        .reduce((sum, e) => sum + (e.soloPayer ? (e.myShare || e.amount) : e.amount), 0);
      const totalGroup = mapped
        .filter((e) => e.analyticsType === 'group')
        .reduce((sum, e) => sum + (e.myShare || 0), 0);

      setSummary({
        totalPersonal,
        totalGroup,
        recentExpenses: mapped.slice(0, 5),
        allExpenses: mapped,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    const recategorize = async () => {
      if (!user) return;
      const key = `recategorized_${user.id}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, 'true');
      const { data } = await supabase
        .from('expenses').select('id, description, category')
        .eq('user_id', user.id).in('category', ['general', 'other']);
      if (!data?.length) return;
      let updated = 0;
      for (const exp of data) {
        const detected = detectCategory(exp.description);
        if (detected && detected !== exp.category) {
          await supabase.from('expenses').update({ category: detected }).eq('id', exp.id);
          updated++;
        }
      }
      if (updated > 0) { toast.success(`${updated} expenses auto-categorized!`); fetchSummary(); }
    };
    recategorize();
  }, [user]);

  useEffect(() => { fetchSummary(); }, [user, dateFrom, dateTo]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-24">
        <div>
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-2xl sm:text-3xl font-display font-bold">
            My Expenses
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-sm sm:text-base text-muted-foreground mt-1">
            {format(dateFrom, 'dd MMM')} – {format(dateTo, 'dd MMM yyyy')} Overview
          </motion.p>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 flex-wrap">
          {(() => {
            const today = new Date();
            const anchor = isCustomRange ? today : dateFrom;
            const isCurrent = !isCustomRange && isSameMonth(anchor, today);
            const isFuture = !isCustomRange && anchor > today;
            const label = isCustomRange
              ? `${format(dateFrom, 'dd MMM')} – ${format(dateTo, 'dd MMM yy')}`
              : format(anchor, 'MMMM yyyy');
            return (
              <>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                  onClick={() => goToMonth(subMonths(isCustomRange ? today : anchor, 1))} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => goToMonth(new Date())} className="flex-1 min-w-0 justify-center font-medium text-xs sm:text-sm">
                  <CalendarIcon className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{label}</span>
                  {isCurrent && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Now</span>}
                  {isFuture && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Upcoming</span>}
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                  onClick={() => goToMonth(addMonths(isCustomRange ? today : anchor, 1))} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Popover open={customOpen} onOpenChange={setCustomOpen}>
                  <PopoverTrigger asChild>
                    <Button variant={isCustomRange ? 'default' : 'outline'} size="icon" className="h-9 w-9 shrink-0" aria-label="Custom date range">
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3 space-y-3" align="end">
                    <p className="text-xs font-semibold text-muted-foreground">Custom date range</p>
                    <div className="flex items-center gap-2">
                      <Popover open={fromOpen} onOpenChange={setFromOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="flex-1 justify-start text-xs">
                            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />{format(dateFrom, 'dd/MM/yy')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={dateFrom}
                            onSelect={(d) => { if (d) { setDateFrom(d); setIsCustomRange(true); setFromOpen(false); } }}
                            initialFocus className={cn('p-3 pointer-events-auto')} />
                        </PopoverContent>
                      </Popover>
                      <span className="text-xs text-muted-foreground">to</span>
                      <Popover open={toOpen} onOpenChange={setToOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="flex-1 justify-start text-xs">
                            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />{format(dateTo, 'dd/MM/yy')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar mode="single" selected={dateTo}
                            onSelect={(d) => { if (d) { setDateTo(d); setIsCustomRange(true); setToOpen(false); } }}
                            initialFocus className={cn('p-3 pointer-events-auto')} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <Button size="sm" className="w-full" onClick={() => { goToMonth(new Date()); setCustomOpen(false); }}>
                      Reset to this month
                    </Button>
                  </PopoverContent>
                </Popover>
              </>
            );
          })()}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <BudgetCard totalSpent={summary.totalPersonal + summary.totalGroup} onBudgetChange={fetchSummary} />
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <StatCard title="Personal" value={`₹${summary.totalPersonal.toLocaleString('en-IN')}`}
              icon={Wallet} iconColor="text-primary" iconBgColor="bg-primary/10"
              onClick={() => setBreakdownKind('personal')} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <StatCard title="My Share (Group)" value={`₹${summary.totalGroup.toLocaleString('en-IN')}`}
              icon={Users} iconColor="text-accent-foreground" iconBgColor="bg-accent"
              onClick={() => setBreakdownKind('share')} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <StatCard title="Total" value={`₹${(summary.totalPersonal + summary.totalGroup).toLocaleString('en-IN')}`}
              icon={TrendingUp} iconColor="text-success" iconBgColor="bg-success/10"
              onClick={() => setBreakdownKind('total')} />
          </motion.div>
        </div>

        <p className="text-[11px] text-muted-foreground -mt-3">Tap a card above to see the detailed breakdown.</p>

        <AnalyticsBreakdownDialog
          open={!!breakdownKind}
          onOpenChange={(o) => !o && setBreakdownKind(null)}
          kind={breakdownKind || 'total'}
          expenses={summary.allExpenses}
          rangeLabel={`${format(dateFrom, 'dd MMM')} – ${format(dateTo, 'dd MMM yyyy')}`}
        />

        <ChartToggle expenses={summary.allExpenses} dateFrom={dateFrom} dateTo={dateTo} />

        <Card className="border border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Recent Expenses</CardTitle>
            <Link to="/expenses/all">
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                View All<ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/50 rounded-xl animate-pulse" />)}</div>
            ) : summary.recentExpenses.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex p-4 rounded-full bg-muted/50 mb-4"><TrendingDown className="h-8 w-8 text-muted-foreground" /></div>
                <p className="text-muted-foreground">No expenses yet this month</p>
                <p className="text-sm text-muted-foreground mt-1">Tap + to add your first expense</p>
              </div>
            ) : (
              <div className="space-y-3">
                {summary.recentExpenses.map((expense, i) => (
                  <motion.div key={expense.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                    <ExpenseCard {...expense} showDate compact />
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}