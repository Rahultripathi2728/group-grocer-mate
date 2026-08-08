import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getCategoryById } from '@/lib/categories';
import { SplitItem, parseSplitItems } from '@/lib/split-items';
import { Button } from '@/components/ui/button';
import AddExpenseSheet from '@/components/expenses/AddExpenseSheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, CheckCircle2, Lock, Pencil, Trash2, Users, Wallet } from 'lucide-react';

interface Row {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  expense_type: string;
  category: string | null;
  is_settled: boolean;
  user_id: string;
  group_id: string | null;
  groupName?: string;
  splitItems: SplitItem[] | null;
}

interface ShareRow { user_id: string; full_name: string; amount_owed: number; is_paid: boolean }

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<Row | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [addedBy, setAddedBy] = useState<string>('You');
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    const { data: exp } = await supabase
      .from('expenses')
      .select('*, groups(name)')
      .eq('id', id)
      .maybeSingle();

    if (!exp) { setRow(null); setLoading(false); return; }

    const mapped: Row = {
      id: exp.id,
      description: exp.description,
      amount: Number(exp.amount),
      expense_date: exp.expense_date,
      expense_type: exp.expense_type,
      category: exp.category,
      is_settled: exp.is_settled,
      user_id: exp.user_id,
      group_id: exp.group_id,
      groupName: (exp as { groups?: { name?: string } }).groups?.name,
      splitItems: parseSplitItems((exp as { split_items?: unknown }).split_items),
    };
    setRow(mapped);

    if (mapped.expense_type === 'group') {
      const [{ data: splits }, memberRes, groupRes] = await Promise.all([
        supabase.from('expense_splits').select('user_id, amount_owed, is_paid').eq('expense_id', mapped.id),
        mapped.group_id
          ? supabase.from('group_memberships').select('user_id').eq('group_id', mapped.group_id)
          : Promise.resolve({ data: [] as { user_id: string }[] }),
        mapped.group_id
          ? supabase.from('groups').select('owner_id').eq('id', mapped.group_id).maybeSingle()
          : Promise.resolve({ data: null as { owner_id: string } | null }),
      ]);

      const memberIds = Array.from(new Set([
        ...(memberRes.data || []).map((m) => m.user_id),
        (groupRes.data as { owner_id: string } | null)?.owner_id,
        ...(splits || []).map((s) => s.user_id),
        mapped.user_id,
      ].filter(Boolean) as string[]));

      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', memberIds);
      const nameOf = new Map<string, string>((profs || []).map((p) => [p.id, p.full_name || 'Member']));
      setNames(Object.fromEntries(memberIds.map((uid) => [uid, uid === user.id ? 'You' : (nameOf.get(uid) || 'Member')])));
      setAddedBy(mapped.user_id === user.id ? 'You' : (nameOf.get(mapped.user_id) || 'Member'));

      const owed = new Map((splits || []).map((s) => [s.user_id, s]));
      setShares(memberIds.map((uid) => {
        const s = owed.get(uid);
        return {
          user_id: uid,
          full_name: uid === user.id ? 'You' : (nameOf.get(uid) || 'Member'),
          amount_owed: Number(s?.amount_owed || 0),
          is_paid: !!s?.is_paid,
        };
      }).sort((a, b) => b.amount_owed - a.amount_owed));

      setLocked((splits || []).some((s) => s.is_paid && s.user_id !== mapped.user_id));
    } else {
      setShares([]);
      setLocked(false);
      setAddedBy('You');
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!row) return;
    const { error } = await supabase.from('expenses').delete().eq('id', row.id);
    if (error) {
      toast.error(/locked/i.test(error.message)
        ? 'Locked — a member already settled their share of this expense'
        : 'Failed to delete expense');
      return;
    }
    toast.success('Expense deleted');
    navigate(-1);
  };

  const myShare = shares.find((s) => s.user_id === user?.id)?.amount_owed ?? row?.amount ?? 0;
  const cat = getCategoryById(row?.category);
  const CatIcon = cat.icon;
  const canEdit = !!row && !row.is_settled && !locked && row.user_id === user?.id;
  const paidCount = shares.filter((s) => s.amount_owed > 0 && s.is_paid).length;
  const owingCount = shares.filter((s) => s.amount_owed > 0).length;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Sticky header with back */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-3 py-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-display font-semibold truncate">Expense details</h1>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />)}
        </div>
      ) : !row ? (
        <div className="p-10 text-center text-sm text-muted-foreground">This expense is no longer available.</div>
      ) : (
        <main className="px-4 pt-4 pb-32 space-y-5 max-w-xl mx-auto">
          {/* Hero */}
          <section className="flex items-start gap-4">
            <div className={cn('p-3.5 rounded-2xl shrink-0', cat.bgColor)}>
              <CatIcon className={cn('h-7 w-7', cat.color)} />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-display font-bold leading-tight break-words">{row.description}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{cat.label}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md',
                  row.expense_type === 'personal' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground',
                )}>
                  {row.expense_type === 'personal'
                    ? <><Wallet className="h-3 w-3" /> Personal</>
                    : <><Users className="h-3 w-3" /> {row.groupName || 'Group'}</>}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md',
                  row.is_settled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                )}>
                  {row.is_settled ? <><CheckCircle2 className="h-3 w-3" /> Settled</> : 'Unsettled'}
                </span>
                {locked && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                    <Lock className="h-3 w-3" /> Locked
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Amounts */}
          <section className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-muted/50">
              <p className="text-xs text-muted-foreground">Total amount</p>
              <p className="font-display font-bold text-2xl mt-0.5">₹{row.amount.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-4 rounded-2xl bg-muted/50">
              <p className="text-xs text-muted-foreground">Your share</p>
              <p className="font-display font-bold text-2xl mt-0.5">₹{myShare.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-muted/50">
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="font-semibold text-sm mt-0.5">{format(new Date(`${row.expense_date}T00:00:00`), 'dd MMM yyyy')}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-muted/50">
              <p className="text-xs text-muted-foreground">Paid by</p>
              <p className="font-semibold text-sm mt-0.5">{row.expense_type === 'group' ? addedBy : 'You'}</p>
            </div>
          </section>

          {/* Item-wise breakdown */}
          {row.splitItems && row.splitItems.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Item wise · {row.splitItems.length} {row.splitItems.length === 1 ? 'item' : 'items'}
              </h3>
              {row.splitItems.map((it, idx) => {
                const per = it.amount / it.user_ids.length;
                const solo = it.user_ids.length === 1;
                return (
                  <div key={`${it.name}-${idx}`} className="rounded-2xl border border-border p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{it.name}</p>
                      <p className="text-sm font-bold shrink-0">₹{it.amount.toLocaleString('en-IN')}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Split among {it.user_ids.length} {it.user_ids.length === 1 ? 'person' : 'people'} · ₹{per.toFixed(2)} each
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {it.user_ids.map((uid) => (
                        <span key={uid} className="text-[11px] px-2 py-0.5 rounded-md bg-muted">
                          {names[uid] || (uid === user?.id ? 'You' : 'Member')} · ₹{per.toFixed(2)}
                        </span>
                      ))}
                    </div>
                    {solo && (
                      <p className="text-[11px] text-primary mt-2">
                        100% {it.user_ids[0] === user?.id ? 'yours' : `${names[it.user_ids[0]] || 'member'}'s`} — counted as a personal expense
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* Per person shares */}
          {row.expense_type === 'group' && shares.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per person share</h3>
                <span className="text-[11px] text-muted-foreground">{paidCount}/{owingCount} settled</span>
              </div>
              {shares.map((s) => (
                <div
                  key={s.user_id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3',
                    s.amount_owed > 0 ? 'bg-muted/50' : 'bg-muted/20',
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 rounded-full bg-background border border-border flex items-center justify-center text-xs font-bold shrink-0">
                      {s.full_name[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.full_name}</p>
                      {s.amount_owed > 0 && (
                        <p className={cn('text-[11px]', s.is_paid ? 'text-success' : 'text-muted-foreground')}>
                          {s.is_paid ? 'Paid' : 'Pending'}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={cn('text-sm font-bold shrink-0', s.amount_owed > 0 ? '' : 'text-muted-foreground')}>
                    {s.amount_owed > 0 ? `₹${s.amount_owed.toLocaleString('en-IN')}` : 'Not included'}
                  </span>
                </div>
              ))}
            </section>
          )}

          {locked && (
            <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-3.5 py-3">
              <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Locked — a member has already settled their share, so this expense can no longer be edited or deleted.
              </p>
            </div>
          )}
        </main>
      )}

      {/* Sticky actions */}
      {canEdit && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
          <div className="max-w-xl mx-auto flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        </div>
      )}

      {row && (
        <AddExpenseSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          editExpense={{
            id: row.id,
            description: row.description,
            amount: row.amount,
            expense_date: row.expense_date,
            category: row.category,
            expense_type: row.expense_type,
            group_id: row.group_id,
          }}
          onSuccess={load}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {row && <>Are you sure you want to delete <strong>"{row.description}"</strong> (₹{row.amount.toLocaleString('en-IN')})? This cannot be undone.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
