import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getCategoryById } from '@/lib/categories';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Wallet, Users } from 'lucide-react';

export type BreakdownKind = 'personal' | 'share' | 'total';

export interface BreakdownExpense {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  expense_type: string;
  category?: string | null;
  myShare?: number;
  groupName?: string;
  group_id?: string | null;
  analyticsType?: 'personal' | 'group';
  soloPayer?: boolean;
  itemNames?: string[];
  paidByName?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: BreakdownKind;
  expenses: BreakdownExpense[];
  rangeLabel: string;
}

const TITLES: Record<BreakdownKind, string> = {
  personal: 'Personal spending',
  share: 'My share in groups',
  total: 'Total spending',
};

export default function AnalyticsBreakdownDialog({ open, onOpenChange, kind, expenses, rangeLabel }: Props) {
  const [groupFilter, setGroupFilter] = useState<string>('all');

  const base = useMemo(() => {
    const list = expenses.filter((e) => {
      if (kind === 'personal') return e.analyticsType === 'personal';
      if (kind === 'share') return e.analyticsType === 'group';
      return true;
    });
    return [...list].sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));
  }, [expenses, kind]);

  const groups = useMemo(() => {
    const map = new Map<string, string>();
    base.forEach((e) => {
      if (e.group_id) map.set(e.group_id, e.groupName || 'Group');
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [base]);

  const rows = useMemo(
    () => (groupFilter === 'all' ? base : base.filter((e) => e.group_id === groupFilter)),
    [base, groupFilter],
  );

  const valueOf = (e: BreakdownExpense) =>
    e.analyticsType === 'group' ? (e.myShare ?? 0) : e.amount;
  const total = rows.reduce((s, e) => s + valueOf(e), 0);

  const initials = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-none w-screen h-[100dvh] sm:h-[100dvh] rounded-none border-0 p-0 gap-0 flex flex-col translate-x-0 translate-y-0 top-0 left-0 sm:max-w-none data-[state=open]:slide-in-from-bottom-4"
      >
        <DialogHeader className="shrink-0 px-4 pt-4 pb-3 pr-12 border-b border-border text-left space-y-0.5">
          <DialogTitle className="font-display text-xl text-left">{TITLES[kind]}</DialogTitle>
          <p className="text-xs text-muted-foreground text-left">{rangeLabel}</p>
        </DialogHeader>

        <div className="shrink-0 px-4 pt-4">
          <div className="p-3 rounded-xl bg-muted/50">
            <p className="text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? 'expense' : 'expenses'}
            </p>
            <p className="text-2xl font-display font-bold">₹{total.toLocaleString('en-IN')}</p>
          </div>
        </div>

        {groups.length > 0 && (
          <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
            <button
              onClick={() => setGroupFilter('all')}
              className={cn(
                'shrink-0 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
                groupFilter === 'all'
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border',
              )}
            >
              All
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setGroupFilter(g.id)}
                className={cn(
                  'shrink-0 h-8 pl-1 pr-3 rounded-full border text-xs font-medium flex items-center gap-1.5 max-w-40 transition-colors',
                  groupFilter === g.id
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-border',
                )}
              >
                <span className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                  groupFilter === g.id ? 'bg-background/20 text-background' : 'bg-muted text-foreground',
                )}>
                  {initials(g.name)}
                </span>
                <span className="truncate">{g.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 px-4 pb-6">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nothing here for this range.</p>
          ) : (
            rows.map((e) => {
              const cat = getCategoryById(e.category);
              const Icon = cat.icon;
              return (
                <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                  <div className={cn('p-2 rounded-lg shrink-0', cat.bgColor)}>
                    <Icon className={cn('h-4 w-4', cat.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{e.description}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(e.expense_date), 'dd MMM')}
                      </span>
                      <span className={cn(
                        'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md',
                        e.analyticsType === 'personal' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground',
                      )}>
                        {e.analyticsType === 'personal'
                          ? <><Wallet className="h-2.5 w-2.5" /> Personal</>
                          : <><Users className="h-2.5 w-2.5" /> {e.groupName || 'Group'}</>}
                      </span>
                      {e.soloPayer && (
                        <span className="text-[10px] text-muted-foreground">
                          only you{e.paidByName && e.paidByName !== 'You' ? ` · paid by ${e.paidByName}` : ''}
                        </span>
                      )}
                    </div>
                    {e.itemNames && e.itemNames.length > 0 && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        Items: {e.itemNames.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">₹{valueOf(e).toLocaleString('en-IN')}</p>
                    {e.analyticsType === 'group' && e.myShare !== e.amount && (
                      <p className="text-[10px] text-muted-foreground">of ₹{e.amount.toLocaleString('en-IN')}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}