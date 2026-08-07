import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Users, Wallet, ArrowLeft, Plus, X, Info, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SplitItem, parseSplitItems } from '@/lib/split-items';

type Mode = 'group' | 'personal';
type SplitMode = 'equal' | 'unequal' | 'itemwise';

interface Group { id: string; name: string }
interface Person { user_id: string; full_name: string }

interface BillItem {
  id: string;
  name: string;
  amount: string;
  selected: Record<string, boolean>;
}

interface Bill {
  id: string;
  description: string;
  amount: string;
  date: string;
  category: string;
  splitMode: SplitMode;
  selected: Record<string, boolean>;
  customAmounts: Record<string, string>;
  items: BillItem[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
  selectedDate?: Date;
  /** When provided the sheet works in edit mode on this expense */
  editExpense?: EditExpenseInput | null;
}

export interface EditExpenseInput {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  category?: string | null;
  expense_type: string;
  group_id?: string | null;
}

/* ---------- draft persistence (so a half-filled form survives app reopen) ---------- */
const DRAFT_KEY = 'add_expense_draft_v1';
const DRAFT_TTL = 12 * 60 * 60 * 1000;

interface Draft {
  mode: Mode;
  activeGroupId: string;
  bills: Bill[];
  activeBillId: string;
  ts: number;
}

export const readExpenseDraft = (): Draft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || !Array.isArray(d.bills) || d.bills.length === 0) return null;
    if (Date.now() - (d.ts || 0) > DRAFT_TTL) return null;
    return d;
  } catch {
    return null;
  }
};

const writeExpenseDraft = (d: Omit<Draft, 'ts'>) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, ts: Date.now() })); } catch { /* ignore */ }
};

export const clearExpenseDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
};

const newBill = (selfId: string, date: string): Bill => ({
  id: crypto.randomUUID(),
  description: '',
  amount: '',
  date,
  category: 'general',
  splitMode: 'equal',
  selected: { [selfId]: true },
  customAmounts: {},
  items: [],
});

const newItem = (ids: string[]): BillItem => ({
  id: crypto.randomUUID(),
  name: '',
  amount: '',
  selected: Object.fromEntries(ids.map((i) => [i, true])),
});

export default function AddExpenseSheet({ open, onOpenChange, onSuccess, selectedDate, editExpense }: Props) {
  const { user } = useAuth();
  const isEdit = !!editExpense;
  const skipInitRef = useRef(false);
  const [view, setView] = useState<'choose' | 'form'>('choose');
  const [mode, setMode] = useState<Mode>('personal');
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [peopleByGroup, setPeopleByGroup] = useState<Record<string, Person[]>>({});
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [activeBillId, setActiveBillId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [unequalOpenFor, setUnequalOpenFor] = useState<string | null>(null);

  const dateStr = useMemo(
    () => (selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')),
    [selectedDate],
  );

  // PARALLEL prefetch: groups + members + profiles, then cache. Runs once per session of open dialog.
  const prefetchAll = useCallback(async () => {
    if (!user) return;
    const [ownedRes, msRes] = await Promise.all([
      supabase.from('groups').select('id, name, owner_id').eq('owner_id', user.id),
      supabase.from('group_memberships').select('group_id, groups(id, name, owner_id)').eq('user_id', user.id),
    ]);
    const owned = (ownedRes.data || []) as Array<{ id: string; name: string; owner_id: string }>;
    const memberG = ((msRes.data || []).map((m: any) => m.groups).filter(Boolean)) as Array<{ id: string; name: string; owner_id: string }>;
    const all = [...owned, ...memberG];
    const uniq = all.filter((g, i, a) => i === a.findIndex((x) => x.id === g.id));
    setGroups(uniq.map((g) => ({ id: g.id, name: g.name })));
    setGroupsLoaded(true);

    if (uniq.length === 0) return;
    const groupIds = uniq.map((g) => g.id);
    const { data: allMs } = await supabase
      .from('group_memberships').select('group_id, user_id').in('group_id', groupIds);

    const idSet = new Set<string>();
    uniq.forEach((g) => idSet.add(g.owner_id));
    (allMs || []).forEach((m: any) => idSet.add(m.user_id));

    const { data: profs } = await supabase
      .from('profiles').select('id, full_name').in('id', Array.from(idSet));
    const profMap = new Map<string, string>();
    (profs || []).forEach((p: any) => profMap.set(p.id, p.full_name || 'User'));

    const map: Record<string, Person[]> = {};
    uniq.forEach((g) => {
      const ids = new Set<string>([g.owner_id]);
      (allMs || []).filter((m: any) => m.group_id === g.id).forEach((m: any) => ids.add(m.user_id));
      map[g.id] = Array.from(ids).map((id) => ({
        user_id: id,
        full_name: id === user.id ? 'You' : (profMap.get(id) || 'User'),
      }));
    });
    setPeopleByGroup(map);
  }, [user]);

  useEffect(() => {
    if (!open || !user) return;
    if (!groupsLoaded) prefetchAll();
    if (isEdit) return; // edit mode is hydrated by the effect below

    const draft = readExpenseDraft();
    if (draft) {
      skipInitRef.current = true;
      setMode(draft.mode);
      setActiveGroupId(draft.activeGroupId);
      setBills(draft.bills);
      setActiveBillId(draft.activeBillId || draft.bills[0].id);
      setView('form');
      return;
    }
    setView('choose');
    setMode('personal');
    setActiveGroupId('');
    setBills([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, isEdit]);

  // Hydrate the form from an existing expense (edit mode)
  useEffect(() => {
    if (!open || !user || !editExpense) return;
    let cancelled = false;
    const load = async () => {
      const isGroup = editExpense.expense_type === 'group' && !!editExpense.group_id;
      const b = newBill(user.id, editExpense.expense_date);
      b.description = editExpense.description;
      b.amount = String(editExpense.amount);
      b.category = editExpense.category || 'general';

      if (editExpense.expense_type !== 'personal') {
        const { data: splits } = await supabase
          .from('expense_splits')
          .select('user_id, amount_owed')
          .eq('expense_id', editExpense.id);
        const rows = (splits || []).map((s) => ({ user_id: s.user_id, amount: Number(s.amount_owed) }));
        if (rows.length > 0) {
          b.selected = Object.fromEntries(rows.map((r) => [r.user_id, true]));
          b.customAmounts = Object.fromEntries(rows.map((r) => [r.user_id, r.amount.toFixed(2)]));
          const allEqual = rows.every((r) => Math.abs(r.amount - rows[0].amount) < 0.02);
          b.splitMode = allEqual ? 'equal' : 'unequal';
        }
      }
      if (cancelled) return;
      skipInitRef.current = true;
      setMode(isGroup ? 'group' : 'personal');
      setActiveGroupId(editExpense.group_id || '');
      setBills([b]);
      setActiveBillId(b.id);
      setView('form');
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, editExpense?.id]);

  const people: Person[] = useMemo(() => {
    if (!user) return [];
    if (mode === 'personal') return [{ user_id: user.id, full_name: 'You' }];
    if (mode === 'group' && activeGroupId) return peopleByGroup[activeGroupId] || [{ user_id: user.id, full_name: 'You' }];
    return [];
  }, [mode, activeGroupId, peopleByGroup, user]);

  // Instantly init first bill when form opens
  useEffect(() => {
    if (!user || view !== 'form') return;
    if (skipInitRef.current) { skipInitRef.current = false; return; }
    if (isEdit) return;
    const b = newBill(user.id, dateStr);
    b.selected = Object.fromEntries(people.map((p) => [p.user_id, true]));
    setBills([b]);
    setActiveBillId(b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mode, activeGroupId, user, dateStr]);

  // Sync new members when background fetch completes
  useEffect(() => {
    if (view !== 'form' || isEdit) return;
    setBills((prev) => prev.map((b) => {
      const next = { ...b.selected };
      let changed = false;
      people.forEach((p) => { if (!(p.user_id in next)) { next[p.user_id] = true; changed = true; } });
      return changed ? { ...b, selected: next } : b;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.length]);

  // Keep an in-progress draft so reopening the app resumes where the user left off
  useEffect(() => {
    if (!open || isEdit) return;
    if (view !== 'form' || bills.length === 0) return;
    writeExpenseDraft({ mode, activeGroupId, bills, activeBillId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, view, mode, activeGroupId, bills, activeBillId]);

  const handleOpenChange = (o: boolean) => {
    if (!o && !isEdit) clearExpenseDraft();
    onOpenChange(o);
  };

  const activeBill = bills.find((b) => b.id === activeBillId);

  const updateBill = (id: string, patch: Partial<Bill>) => {
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const addBill = () => {
    if (!user) return;
    const b = newBill(user.id, dateStr);
    b.selected = Object.fromEntries(people.map((p) => [p.user_id, true]));
    setBills((prev) => [...prev, b]);
    setActiveBillId(b.id);
  };

  const removeBill = (id: string) => {
    setBills((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (activeBillId === id && next.length) setActiveBillId(next[0].id);
      return next;
    });
  };

  const chooseMode = (m: Mode, groupId = '') => {
    setMode(m);
    setActiveGroupId(groupId);
    setView('form');
  };

  const itemsTotal = (bill: Bill) =>
    bill.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

  /**
   * Item-wise bills stay ONE expense. The item list (name, amount, who shares it)
   * is stored on the expense itself so analytics can treat an item shared by a
   * single person as that person's personal spend.
   */
  const itemPayload = (bill: Bill): SplitItem[] | null => {
    const rows: SplitItem[] = [];
    for (const it of bill.items) {
      const amount = Math.round((parseFloat(it.amount) || 0) * 100) / 100;
      const user_ids = Object.entries(it.selected).filter(([, v]) => v).map(([k]) => k);
      if (amount <= 0 || user_ids.length === 0) continue;
      rows.push({ name: it.name.trim() || 'Item', amount, user_ids });
    }
    return rows.length ? rows : null;
  };

  const computeSplits = (bill: Bill, total: number) => {
    if (bill.splitMode === 'itemwise') {
      if (bill.items.length === 0) return null;
      const owed: Record<string, number> = {};
      for (const it of bill.items) {
        const amt = parseFloat(it.amount) || 0;
        const ids = Object.entries(it.selected).filter(([, v]) => v).map(([k]) => k);
        if (ids.length === 0 || amt <= 0) continue;
        const per = amt / ids.length;
        ids.forEach((uid) => { owed[uid] = (owed[uid] || 0) + per; });
      }
      const splits = Object.entries(owed).map(([user_id, v]) => ({
        user_id, amount_owed: Math.round(v * 100) / 100,
      }));
      if (splits.length === 0) return null;
      const sum = splits.reduce((s, x) => s + x.amount_owed, 0);
      if (Math.abs(sum - total) > 0.05) return 'invalid' as const;
      return splits;
    }
    const selectedIds = Object.entries(bill.selected).filter(([, v]) => v).map(([k]) => k);
    if (selectedIds.length === 0) return null;
    if (bill.splitMode === 'equal') {
      const per = Math.round((total / selectedIds.length) * 100) / 100;
      return selectedIds.map((uid) => ({ user_id: uid, amount_owed: per }));
    }
    const splits = selectedIds.map((uid) => ({
      user_id: uid,
      amount_owed: Math.round((parseFloat(bill.customAmounts[uid] || '0') || 0) * 100) / 100,
    }));
    const sum = splits.reduce((s, x) => s + x.amount_owed, 0);
    if (Math.abs(sum - total) > 0.01) return 'invalid' as const;
    return splits;
  };

  const handleUpdate = async () => {
    if (!user || !editExpense) return;
    const b = bills[0];
    if (!b) return;
    const rawAmt = b.splitMode === 'itemwise' ? itemsTotal(b) : parseFloat(b.amount);
    if (!b.description.trim()) return toast.error('Description is required');
    if (isNaN(rawAmt) || rawAmt <= 0) return toast.error('Enter a valid amount');
    const amt = Math.round(rawAmt * 100) / 100;

    let splits: Array<{ user_id: string; amount_owed: number }> | null = null;
    if (mode === 'group') {
      const res = computeSplits(b, amt);
      if (!res) return toast.error('Pick at least one person to split with');
      if (res === 'invalid') return toast.error(`Splits don't add up to ₹${amt}`);
      splits = res;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('expenses').update({
        description: b.description.trim().slice(0, 500),
        amount: amt,
        expense_date: b.date,
        category: b.category || 'general',
      }).eq('id', editExpense.id);
      if (error) throw error;

      if (splits) {
        await supabase.from('expense_splits').delete().eq('expense_id', editExpense.id);
        const { error: sErr } = await supabase.from('expense_splits').insert(
          splits.map((s) => ({
            expense_id: editExpense.id,
            user_id: s.user_id,
            amount_owed: s.amount_owed,
            is_paid: s.user_id === user.id,
          })),
        );
        if (sErr) throw sErr;
      }
      toast.success('Expense updated');
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (isEdit) return handleUpdate();
    for (const b of bills) {
      const amt = b.splitMode === 'itemwise' ? itemsTotal(b) : parseFloat(b.amount);
      if (!b.description.trim()) return toast.error(`Bill: description required`);
      if (isNaN(amt) || amt <= 0) return toast.error(`Bill "${b.description || '...'}" needs valid amount`);
      if (mode !== 'personal') {
        const splits = computeSplits(b, amt);
        if (!splits) return toast.error(`Pick at least one person to split with`);
        if (splits === 'invalid') return toast.error(`Splits in "${b.description}" don't add up to ₹${amt}`);
      }
    }
    setSubmitting(true);
    try {
      for (const b of bills) {
        const rawAmt = b.splitMode === 'itemwise' ? itemsTotal(b) : parseFloat(b.amount);
        const amt = Math.round(rawAmt * 100) / 100;
        const expense_type = mode === 'group' ? 'group' : 'personal';

        const { data: exp, error } = await supabase.from('expenses').insert({
          user_id: user.id,
          description: b.description.trim().slice(0, 500),
          amount: amt,
          expense_date: b.date,
          expense_type,
          category: b.category || 'general',
          group_id: mode === 'group' ? activeGroupId : null,
          split_items: (mode === 'group' && b.splitMode === 'itemwise'
            ? itemPayload(b)
            : null) as unknown as never,
        }).select().single();
        if (error || !exp) throw error || new Error('insert failed');

        if (mode !== 'personal') {
          const splits = computeSplits(b, amt) as Array<{ user_id: string; amount_owed: number }>;
          const rows = splits.map((s) => ({
            expense_id: exp.id,
            user_id: s.user_id,
            amount_owed: s.amount_owed,
            is_paid: s.user_id === user.id,
          }));
          const { error: sErr } = await supabase.from('expense_splits').insert(rows);
          if (sErr) throw sErr;
        }
      }
      toast.success(`Added ${bills.length} ${bills.length === 1 ? 'expense' : 'expenses'}`);
      clearExpenseDraft();
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const headerLabel = mode === 'group'
    ? (groups.find((g) => g.id === activeGroupId)?.name || 'Group')
    : 'Personal';

  const initials = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Choose view — bottom sheet */}
      <Sheet open={open && view === 'choose'} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl border-t border-border p-0 max-h-[85dvh] flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="font-display text-lg text-left">Add Expense</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Add expense to group</p>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              {!groupsLoaded ? (
                <div className="flex gap-3 pb-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-1 min-w-16">
                      <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
                      <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : groups.length === 0 ? (
                <p className="text-xs text-muted-foreground">No groups yet. Create one from the Groups tab.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => chooseMode('group', g.id)}
                      className="flex flex-col items-center gap-1 min-w-16"
                    >
                      <div className="h-14 w-14 rounded-full bg-primary/10 border border-border flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <span className="text-xs text-foreground line-clamp-1 max-w-16 text-center">{g.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => chooseMode('personal')}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 text-left"
            >
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Wallet className="h-5 w-5 text-foreground" />
              </div>
              <span className="font-medium">Add expense as personal</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Form dialog — full-screen */}
      <Dialog open={open && view === 'form'} onOpenChange={handleOpenChange}>
        <DialogContent
          className="!left-0 !top-0 !translate-x-0 !translate-y-0 !max-w-none w-screen h-[100dvh] !rounded-none border-0 p-0 gap-0 flex flex-col data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4"
        >
          <DialogHeader className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => (isEdit ? onOpenChange(false) : setView('choose'))}
                  className="p-1 -ml-1 rounded hover:bg-muted"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <DialogTitle className="font-display text-lg">{isEdit ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium max-w-[40%] truncate">
                {headerLabel}
              </span>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {mode !== 'personal' && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {people.map((p) => (
                  <div key={p.user_id} className="flex flex-col items-center gap-1 min-w-14">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-muted text-xs">{initials(p.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-[11px] line-clamp-1 max-w-14 text-center">
                      {p.user_id === user?.id ? 'You' : p.full_name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!isEdit && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {bills.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => setActiveBillId(b.id)}
                  className={cn(
                    'group flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm whitespace-nowrap',
                    activeBillId === b.id
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-foreground border-border',
                  )}
                >
                  Bill {i + 1}
                  {bills.length > 1 && (
                    <X
                      className="h-3.5 w-3.5 opacity-70 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); removeBill(b.id); }}
                    />
                  )}
                </button>
              ))}
              <button
                onClick={addBill}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-primary text-primary text-sm"
              >
                <Plus className="h-3.5 w-3.5" /> Add bill
              </button>
            </div>
            )}

            {activeBill && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    placeholder="What did you buy?"
                    value={activeBill.description}
                    onChange={(e) => updateBill(activeBill.id, { description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Price (₹)</Label>
                    <Input
                      type="number" step="0.01" min="0" placeholder="0.00"
                      value={activeBill.splitMode === 'itemwise'
                        ? itemsTotal(activeBill).toFixed(2)
                        : activeBill.amount}
                      disabled={activeBill.splitMode === 'itemwise'}
                      onChange={(e) => updateBill(activeBill.id, { amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={activeBill.date}
                      onChange={(e) => updateBill(activeBill.id, { date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={activeBill.category} onValueChange={(v) => updateBill(activeBill.id, { category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="food">Food & Groceries</SelectItem>
                      <SelectItem value="transport">Transport</SelectItem>
                      <SelectItem value="utilities">Utilities</SelectItem>
                      <SelectItem value="entertainment">Entertainment</SelectItem>
                      <SelectItem value="shopping">Shopping</SelectItem>
                      <SelectItem value="health">Health</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Split */}
                {mode !== 'personal' && (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <Label>Split</Label>
                    <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-full">
                      <button
                        onClick={() => updateBill(activeBill.id, { splitMode: 'equal' })}
                        className={cn('py-1.5 rounded-full text-xs font-medium',
                          activeBill.splitMode === 'equal' ? 'bg-primary text-primary-foreground' : 'text-foreground')}
                      >Equally</button>
                      <button
                        onClick={() => {
                          updateBill(activeBill.id, { splitMode: 'unequal' });
                          setUnequalOpenFor(activeBill.id);
                        }}
                        className={cn('py-1.5 rounded-full text-xs font-medium',
                          activeBill.splitMode === 'unequal' ? 'bg-primary text-primary-foreground' : 'text-foreground')}
                      >Unequally</button>
                      <button
                        onClick={() => {
                          const allIds = people.map((p) => p.user_id);
                          updateBill(activeBill.id, {
                            splitMode: 'itemwise',
                            items: activeBill.items.length ? activeBill.items : [newItem(allIds)],
                          });
                        }}
                        className={cn('py-1.5 rounded-full text-xs font-medium',
                          activeBill.splitMode === 'itemwise' ? 'bg-primary text-primary-foreground' : 'text-foreground')}
                      >Item wise</button>
                    </div>

                    {activeBill.splitMode === 'equal' && (() => {
                      const selectedIds = Object.entries(activeBill.selected)
                        .filter(([, v]) => v).map(([k]) => k);
                      const total = parseFloat(activeBill.amount) || 0;
                      const per = selectedIds.length ? total / selectedIds.length : 0;
                      return (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">Split among ( Tap to unselect )</p>
                            {selectedIds.length > 0 && total > 0 && (
                              <p className="text-xs font-medium">
                                ₹{per.toFixed(2)} × {selectedIds.length}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {people.map((p) => {
                              const on = !!activeBill.selected[p.user_id];
                              return (
                                <button
                                  key={p.user_id}
                                  onClick={() => updateBill(activeBill.id, {
                                    selected: { ...activeBill.selected, [p.user_id]: !on },
                                  })}
                                  className={cn(
                                    'flex flex-col items-center px-3 py-1.5 rounded-full border text-sm leading-tight',
                                    on
                                      ? 'bg-primary/10 border-primary text-primary'
                                      : 'bg-background border-border text-muted-foreground',
                                  )}
                                >
                                  <span>{p.user_id === user?.id ? 'You' : p.full_name}</span>
                                  {on && total > 0 && (
                                    <span className="text-[10px] font-semibold opacity-80">
                                      ₹{per.toFixed(2)}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {activeBill.splitMode === 'unequal' && (
                      <Button
                        type="button" variant="outline" size="sm"
                        onClick={() => setUnequalOpenFor(activeBill.id)}
                      >
                        Edit unequal split
                      </Button>
                    )}

                    {activeBill.splitMode === 'itemwise' && (
                      <ItemwiseEditor
                        bill={activeBill}
                        people={people}
                        currentUserId={user?.id}
                        onChange={(patch) => updateBill(activeBill.id, patch)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-background border-t border-border p-3">
            <Button
              onClick={handleSubmit}
              disabled={submitting || bills.length === 0}
              className="w-full h-12 rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting
                ? (isEdit ? 'Updating...' : 'Submitting...')
                : isEdit
                  ? 'Update expense'
                  : `Submit ${bills.length > 1 ? `${bills.length} expenses` : 'expense'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <UnequalSplitSheet
        open={!!unequalOpenFor}
        onClose={() => setUnequalOpenFor(null)}
        bill={bills.find((b) => b.id === unequalOpenFor) || null}
        people={people}
        currentUserId={user?.id}
        onChange={(patch) => unequalOpenFor && updateBill(unequalOpenFor, patch)}
      />
    </>
  );
}

function ItemwiseEditor({
  bill, people, currentUserId, onChange,
}: {
  bill: Bill;
  people: Person[];
  currentUserId?: string;
  onChange: (patch: Partial<Bill>) => void;
}) {
  const updateItem = (id: string, patch: Partial<BillItem>) => {
    onChange({ items: bill.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  };
  const removeItem = (id: string) => {
    onChange({ items: bill.items.filter((it) => it.id !== id) });
  };
  const addItem = () => {
    const ids = people.map((p) => p.user_id);
    onChange({ items: [...bill.items, { id: crypto.randomUUID(), name: '', amount: '', selected: Object.fromEntries(ids.map((i) => [i, true])) }] });
  };

  const total = bill.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

  // Running total each person owes across all items
  const perPersonTotal: Record<string, number> = {};
  bill.items.forEach((it) => {
    const amt = parseFloat(it.amount) || 0;
    const ids = Object.entries(it.selected).filter(([, v]) => v).map(([k]) => k);
    if (!ids.length || amt <= 0) return;
    const per = amt / ids.length;
    ids.forEach((id) => { perPersonTotal[id] = (perPersonTotal[id] || 0) + per; });
  });

  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-muted-foreground">Add each item & pick who shares it</p>
      {bill.items.map((it, idx) => {
        const itemAmt = parseFloat(it.amount) || 0;
        const selectedIds = Object.entries(it.selected).filter(([, v]) => v).map(([k]) => k);
        const perItem = selectedIds.length ? itemAmt / selectedIds.length : 0;
        return (
        <div key={it.id} className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-12">Item {idx + 1}</span>
            <Input
              placeholder="e.g. Paneer"
              value={it.name}
              onChange={(e) => updateItem(it.id, { name: e.target.value })}
              className="h-9 flex-1"
            />
            <Input
              type="number" step="0.01" min="0" placeholder="0"
              value={it.amount}
              onChange={(e) => updateItem(it.id, { amount: e.target.value })}
              className="h-9 w-24"
            />
            {bill.items.length > 1 && (
              <button onClick={() => removeItem(it.id)} className="text-destructive p-1">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">Shared by ( tap to unselect )</p>
            {selectedIds.length > 0 && itemAmt > 0 && (
              <p className="text-[11px] font-medium">₹{perItem.toFixed(2)} × {selectedIds.length}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => {
              const on = !!it.selected[p.user_id];
              return (
                <button
                  key={p.user_id}
                  onClick={() => updateItem(it.id, { selected: { ...it.selected, [p.user_id]: !on } })}
                  className={cn(
                    'flex flex-col items-center px-2.5 py-1 rounded-full border text-xs leading-tight',
                    on ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground',
                  )}
                >
                  <span>{p.user_id === currentUserId ? 'You' : p.full_name}</span>
                  {on && itemAmt > 0 && (
                    <span className="text-[10px] font-semibold opacity-80">₹{perItem.toFixed(2)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        );
      })}

      {Object.keys(perPersonTotal).length > 0 && (
        <div className="rounded-lg border border-border p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Total per person
          </p>
          {people
            .filter((p) => (perPersonTotal[p.user_id] || 0) > 0)
            .map((p) => (
              <div key={p.user_id} className="flex items-center justify-between text-xs">
                <span>{p.user_id === currentUserId ? 'You' : p.full_name}</span>
                <span className="font-semibold">₹{(perPersonTotal[p.user_id] || 0).toFixed(2)}</span>
              </div>
            ))}
          <p className="text-[10px] text-muted-foreground pt-1">
            Items shared by only one person are saved as that person's own expense.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add item
        </Button>
        <span className="text-sm font-semibold">Total: ₹{total.toFixed(2)}</span>
      </div>
    </div>
  );
}

function UnequalSplitSheet({
  open, onClose, bill, people, currentUserId, onChange,
}: {
  open: boolean;
  onClose: () => void;
  bill: Bill | null;
  people: Person[];
  currentUserId?: string;
  onChange: (patch: Partial<Bill>) => void;
}) {
  const [tab, setTab] = useState<'amount' | 'shares'>('amount');
  const [shares, setShares] = useState<Record<string, string>>({});

  useEffect(() => { if (open) setTab('amount'); }, [open]);

  if (!bill) return null;
  const total = parseFloat(bill.amount) || 0;
  const selectedIds = Object.entries(bill.selected).filter(([, v]) => v).map(([k]) => k);
  const enteredSum = selectedIds.reduce(
    (s, id) => s + (parseFloat(bill.customAmounts[id] || '0') || 0), 0,
  );
  const remaining = Math.round((total - enteredSum) * 100) / 100;

  const applyShares = () => {
    const totalShares = selectedIds.reduce((s, id) => s + (parseFloat(shares[id] || '0') || 0), 0);
    if (totalShares <= 0 || total <= 0) return;
    const next: Record<string, string> = { ...bill.customAmounts };
    selectedIds.forEach((id) => {
      const sh = parseFloat(shares[id] || '0') || 0;
      next[id] = ((sh / totalShares) * total).toFixed(2);
    });
    onChange({ customAmounts: next });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display">Unequal split</SheetTitle>
        </SheetHeader>

        <div className="pt-3 space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-full">
            <button
              onClick={() => setTab('amount')}
              className={cn('py-1.5 rounded-full text-sm font-medium',
                tab === 'amount' ? 'bg-primary text-primary-foreground' : 'text-foreground')}
            >By amount</button>
            <button
              onClick={() => setTab('shares')}
              className={cn('py-1.5 rounded-full text-sm font-medium',
                tab === 'shares' ? 'bg-primary text-primary-foreground' : 'text-foreground')}
            >By shares</button>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Split Among ( Tap to unselect )</span>
            <span className="font-medium">{tab === 'amount' ? 'Enter Amount' : 'Enter Shares'}</span>
          </div>

          <div className="space-y-2">
            {people.map((p) => {
              const on = !!bill.selected[p.user_id];
              return (
                <div
                  key={p.user_id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg p-2',
                    on ? 'bg-muted/40' : 'opacity-60',
                  )}
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={(v) => onChange({
                      selected: { ...bill.selected, [p.user_id]: !!v },
                    })}
                  />
                  <span className="flex-1 text-sm">
                    {p.user_id === currentUserId ? 'You' : p.full_name}
                  </span>
                  <Input
                    type="number" step="0.01" min="0" placeholder="0"
                    className="w-24 h-9"
                    disabled={!on}
                    value={tab === 'amount' ? (bill.customAmounts[p.user_id] || '') : (shares[p.user_id] || '')}
                    onChange={(e) => {
                      if (tab === 'amount') {
                        onChange({
                          customAmounts: { ...bill.customAmounts, [p.user_id]: e.target.value },
                        });
                      } else {
                        setShares((s) => ({ ...s, [p.user_id]: e.target.value }));
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <span>People: {selectedIds.length} / {people.length}</span>
            {tab === 'amount' && (
              <span className={cn(Math.abs(remaining) < 0.01 ? 'text-primary' : 'text-destructive')}>
                {remaining >= 0 ? `₹${remaining.toFixed(2)} left` : `₹${Math.abs(remaining).toFixed(2)} over`}
              </span>
            )}
          </div>

          {tab === 'shares' && (
            <Button variant="outline" onClick={applyShares} className="w-full">
              Apply shares → amounts
            </Button>
          )}

          <Button
            onClick={onClose}
            className="w-full h-12 rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
