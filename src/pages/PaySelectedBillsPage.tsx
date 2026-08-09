import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getCategoryById } from '@/lib/categories';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, CheckCircle2, ExternalLink, ListChecks } from 'lucide-react';

interface PendingBill {
  splitId: string;
  expenseId: string;
  description: string;
  amount: number;          // full bill amount
  myShare: number;
  date: string;
  category: string | null;
  payerId: string;
  payerName: string;
}

export default function PaySelectedBillsPage() {
  const [params] = useSearchParams();
  const groupId = params.get('group') || '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [groupName, setGroupName] = useState('');
  const [bills, setBills] = useState<PendingBill[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [upiMap, setUpiMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'select' | 'pay'>('select');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    if (!groupId || !user) return;
    setLoading(true);

    const [{ data: group }, { data: splits }] = await Promise.all([
      supabase.from('groups').select('name').eq('id', groupId).maybeSingle(),
      supabase
        .from('expense_splits')
        .select('id, amount_owed, expense_id, expenses!inner(id, description, amount, expense_date, category, user_id, group_id, expense_type)')
        .eq('user_id', user.id)
        .eq('is_paid', false),
    ]);

    setGroupName(group?.name || 'Group');

    const rows = (splits || [])
      .map((s) => {
        const e = (s as unknown as { expenses: {
          id: string; description: string; amount: number; expense_date: string;
          category: string | null; user_id: string; group_id: string | null; expense_type: string;
        } }).expenses;
        return { s, e };
      })
      .filter(({ e }) => e && e.group_id === groupId && e.expense_type === 'group' && e.user_id !== user.id)
      .map(({ s, e }) => ({
        splitId: s.id,
        expenseId: e.id,
        description: e.description,
        amount: Number(e.amount),
        myShare: Number(s.amount_owed),
        date: e.expense_date,
        category: e.category,
        payerId: e.user_id,
        payerName: 'Member',
      }))
      .filter((r) => r.myShare > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const payerIds = Array.from(new Set(rows.map((r) => r.payerId)));
    if (payerIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', payerIds);
      const nameOf = new Map((profs || []).map((p) => [p.id, p.full_name || 'Member']));
      rows.forEach((r) => { r.payerName = nameOf.get(r.payerId) || 'Member'; });

      const map: Record<string, string> = {};
      await Promise.all(payerIds.map(async (uid) => {
        const { data } = await supabase.rpc('get_member_upi', { p_user_id: uid });
        if (data) map[uid] = data as string;
      }));
      setUpiMap(map);
    }

    setBills(rows);
    setLoading(false);
  }, [groupId, user]);

  useEffect(() => { load(); }, [load]);

  const chosen = useMemo(() => bills.filter((b) => selected[b.splitId]), [bills, selected]);
  const chosenTotal = useMemo(() => chosen.reduce((s, b) => s + b.myShare, 0), [chosen]);

  const perPayer = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number }>();
    chosen.forEach((b) => {
      const cur = m.get(b.payerId) || { name: b.payerName, total: 0, count: 0 };
      cur.total += b.myShare;
      cur.count += 1;
      m.set(b.payerId, cur);
    });
    return Array.from(m, ([payerId, v]) => ({ payerId, ...v })).sort((a, b) => b.total - a.total);
  }, [chosen]);

  const allSelected = bills.length > 0 && bills.every((b) => selected[b.splitId]);
  const toggleAll = () =>
    setSelected(allSelected ? {} : Object.fromEntries(bills.map((b) => [b.splitId, true])));

  const payViaUpi = (payerId: string, name: string, amount: number) => {
    const upi = upiMap[payerId];
    if (!upi) return;
    window.open(
      `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Selected bills settlement')}`,
      '_blank',
    );
  };

  const handleSettle = async () => {
    setSettling(true);
    const { data, error } = await supabase.rpc('settle_my_splits', {
      p_group_id: groupId,
      p_split_ids: chosen.map((b) => b.splitId),
    });
    setSettling(false);
    setConfirmOpen(false);
    if (error) { toast.error('Could not settle the selected bills'); return; }
    const res = Array.isArray(data) ? data[0] : data;
    const count = (res as { splits_settled?: number })?.splits_settled ?? 0;
    if (!count) { toast.error('Nothing was settled — these bills may already be paid'); return; }
    toast.success(`${count} bill${count > 1 ? 's' : ''} settled · ₹${Number((res as { total_amount?: number }).total_amount || 0).toFixed(2)}`);
    setSelected({});
    setStep('select');
    load();
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-3 py-3">
        <button
          onClick={() => (step === 'pay' ? setStep('select') : navigate(-1))}
          aria-label="Go back"
          className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-display font-semibold truncate">
            {step === 'select' ? 'Choose bills to pay' : 'Pay & confirm'}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">{groupName}</p>
        </div>
      </header>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />)}
        </div>
      ) : bills.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 mx-auto text-success" />
          <p className="text-sm text-muted-foreground">You have no pending bills in this group.</p>
        </div>
      ) : step === 'select' ? (
        <main className="px-4 pt-4 pb-40 space-y-3 max-w-xl mx-auto">
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-muted/50 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Tick the bills you want to pay now</p>
              <p className="text-[11px] text-muted-foreground">Unticked bills stay pending for later.</p>
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {allSelected ? 'Clear' : 'Select all'}
            </Button>
          </div>

          {bills.map((b) => {
            const cat = getCategoryById(b.category);
            const CatIcon = cat.icon;
            const on = !!selected[b.splitId];
            return (
              <label
                key={b.splitId}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3.5 cursor-pointer transition-colors',
                  on ? 'border-foreground bg-muted/40' : 'border-border',
                )}
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [b.splitId]: !!v }))}
                />
                <span className={cn('p-2 rounded-xl shrink-0', cat.bgColor)}>
                  <CatIcon className={cn('h-4 w-4', cat.color)} />
                </span>
                <span className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{b.description}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(`${b.date}T00:00:00`), 'dd MMM')} · paid by {b.payerName} · bill ₹{b.amount.toLocaleString('en-IN')}
                  </p>
                </span>
                <span className="text-sm font-bold shrink-0">₹{b.myShare.toFixed(2)}</span>
              </label>
            );
          })}
        </main>
      ) : (
        <main className="px-4 pt-4 pb-40 space-y-3 max-w-xl mx-auto">
          <div className="rounded-2xl bg-muted/50 px-3.5 py-3">
            <p className="text-xs text-muted-foreground">You are paying</p>
            <p className="font-display font-bold text-2xl">₹{chosenTotal.toFixed(2)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              for {chosen.length} bill{chosen.length > 1 ? 's' : ''}
            </p>
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-1">Pay these people</h3>
          {perPayer.map((p) => (
            <div key={p.payerId} className="rounded-2xl border border-border p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{p.count} bill{p.count > 1 ? 's' : ''}</p>
                </div>
                <p className="text-base font-bold shrink-0">₹{p.total.toFixed(2)}</p>
              </div>
              {upiMap[p.payerId] ? (
                <Button variant="outline" className="w-full" onClick={() => payViaUpi(p.payerId, p.name, p.total)}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Pay ₹{p.total.toFixed(2)} via UPI
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {p.name} hasn't added a UPI ID — pay them directly, then confirm below.
                </p>
              )}
            </div>
          ))}

          <p className="text-[11px] text-muted-foreground">
            After the payment goes through, tap “I've paid — settle these bills” to mark only these bills as settled.
          </p>
        </main>
      )}

      {!loading && bills.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
          <div className="max-w-xl mx-auto space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">
                {chosen.length} selected of {bills.length}
              </span>
              <span className="font-display font-bold text-lg">₹{chosenTotal.toFixed(2)}</span>
            </div>
            {step === 'select' ? (
              <Button
                className="w-full bg-foreground text-background hover:bg-foreground/90"
                size="lg"
                disabled={chosen.length === 0}
                onClick={() => setStep('pay')}
              >
                <ListChecks className="h-4 w-4 mr-2" /> Continue to pay
              </Button>
            ) : (
              <Button
                className="w-full bg-foreground text-background hover:bg-foreground/90"
                size="lg"
                disabled={settling || chosen.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {settling ? 'Settling...' : "I've paid — settle these bills"}
              </Button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Settle {chosen.length} selected bill{chosen.length > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only your share of these bills (₹{chosenTotal.toFixed(2)}) will be marked as paid. Your other bills stay
              pending. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-foreground text-background hover:bg-foreground/90"
              onClick={handleSettle}
            >
              Yes, settle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
