import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Users, Wallet, UsersRound, ArrowLeft, Plus, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'group' | 'shared' | 'personal';

interface Group { id: string; name: string }
interface Person { user_id: string; full_name: string }

interface Bill {
  id: string;
  description: string;
  amount: string;
  date: string;
  category: string;
  paidBy: string;          // user_id of payer
  splitMode: 'equal' | 'unequal';
  selected: Record<string, boolean>;        // user_id -> included
  customAmounts: Record<string, string>;    // unequal mode
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
  selectedDate?: Date;
}

const newBill = (selfId: string, date: string): Bill => ({
  id: crypto.randomUUID(),
  description: '',
  amount: '',
  date,
  category: 'general',
  paidBy: selfId,
  splitMode: 'equal',
  selected: { [selfId]: true },
  customAmounts: {},
});

export default function AddExpenseSheet({ open, onOpenChange, onSuccess, selectedDate }: Props) {
  const { user } = useAuth();
  const [view, setView] = useState<'choose' | 'form'>('choose');
  const [mode, setMode] = useState<Mode>('personal');
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [people, setPeople] = useState<Person[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [activeBillId, setActiveBillId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [unequalOpenFor, setUnequalOpenFor] = useState<string | null>(null);

  const dateStr = useMemo(
    () => (selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')),
    [selectedDate],
  );

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    const { data: owned } = await supabase.from('groups').select('id, name').eq('owner_id', user.id);
    const { data: ms } = await supabase
      .from('group_memberships').select('group_id, groups(id, name)').eq('user_id', user.id);
    const memberG = (ms || []).map((m) => m.groups).filter(Boolean) as Group[];
    const all = [...(owned || []), ...memberG];
    setGroups(all.filter((g, i, a) => i === a.findIndex((x) => x.id === g.id)));
  }, [user]);

  // Reset on open
  useEffect(() => {
    if (open && user) {
      setView('choose');
      setMode('personal');
      setActiveGroupId('');
      setPeople([]);
      setBills([]);
      fetchGroups();
    }
  }, [open, user, fetchGroups]);

  // Load people whenever mode / activeGroup changes after form opens
  useEffect(() => {
    const load = async () => {
      if (!user || view !== 'form') return;
      let list: Person[] = [];
      if (mode === 'personal') {
        list = [{ user_id: user.id, full_name: 'You' }];
      } else if (mode === 'group' && activeGroupId) {
        const { data: g } = await supabase.from('groups').select('owner_id').eq('id', activeGroupId).single();
        const { data: ms } = await supabase.from('group_memberships').select('user_id').eq('group_id', activeGroupId);
        const ids = Array.from(new Set([...(ms || []).map((m) => m.user_id), ...(g ? [g.owner_id] : [])]));
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
          list = (profs || []).map((p) => ({ user_id: p.id, full_name: p.full_name || 'User' }));
        }
      } else if (mode === 'shared') {
        // Union of everyone across user's groups
        const groupIds = groups.map((g) => g.id);
        const idSet = new Set<string>([user.id]);
        if (groupIds.length) {
          const { data: ms } = await supabase
            .from('group_memberships').select('user_id').in('group_id', groupIds);
          (ms || []).forEach((m) => idSet.add(m.user_id));
          const { data: gs } = await supabase.from('groups').select('owner_id').in('id', groupIds);
          (gs || []).forEach((g) => idSet.add(g.owner_id));
        }
        const ids = Array.from(idSet);
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        list = (profs || []).map((p) => ({
          user_id: p.id, full_name: p.id === user.id ? 'You' : (p.full_name || 'User'),
        }));
      }
      setPeople(list);
      // Initialize first bill with everyone selected
      const b = newBill(user.id, dateStr);
      b.selected = Object.fromEntries(list.map((p) => [p.user_id, true]));
      setBills([b]);
      setActiveBillId(b.id);
    };
    load();
  }, [view, mode, activeGroupId, user, dateStr, groups]);

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

  const computeSplits = (bill: Bill, total: number) => {
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

  const handleSubmit = async () => {
    if (!user) return;
    // Validate
    for (const b of bills) {
      const amt = parseFloat(b.amount);
      if (!b.description.trim()) return toast.error(`Bill: description required`);
      if (isNaN(amt) || amt <= 0) return toast.error(`Bill "${b.description || '...'}" needs valid amount`);
      if (mode !== 'personal') {
        const splits = computeSplits(b, amt);
        if (!splits) return toast.error(`Pick at least one person to split with`);
        if (splits === 'invalid') return toast.error(`Unequal amounts in "${b.description}" don't add up to ₹${amt}`);
      }
    }
    setSubmitting(true);
    try {
      for (const b of bills) {
        const amt = Math.round(parseFloat(b.amount) * 100) / 100;
        const expense_type = mode === 'group' ? 'group' : mode === 'shared' ? 'shared' : 'personal';
        const { data: exp, error } = await supabase.from('expenses').insert({
          user_id: user.id,
          description: b.description.trim().slice(0, 500),
          amount: amt,
          expense_date: b.date,
          expense_type,
          category: b.category || 'general',
          group_id: mode === 'group' ? activeGroupId : null,
        }).select().single();
        if (error || !exp) throw error || new Error('insert failed');

        if (mode !== 'personal') {
          const splits = computeSplits(b, amt) as Array<{ user_id: string; amount_owed: number }>;
          const rows = splits.map((s) => ({
            expense_id: exp.id,
            user_id: s.user_id,
            amount_owed: s.amount_owed,
            is_paid: s.user_id === b.paidBy,
          }));
          const { error: sErr } = await supabase.from('expense_splits').insert(rows);
          if (sErr) throw sErr;
        }
      }
      toast.success(`Added ${bills.length} ${bills.length === 1 ? 'expense' : 'expenses'}`);
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
    : mode === 'shared' ? 'Shared' : 'Personal';

  const initials = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      <Sheet open={open && view === 'choose'} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Add expense</SheetTitle>
          </SheetHeader>

          <div className="space-y-5 pt-3">
            {/* Groups row */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Add expense to recent groups</p>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              {groups.length === 0 ? (
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
              onClick={() => chooseMode('shared')}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 text-left"
            >
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <UsersRound className="h-5 w-5 text-foreground" />
              </div>
              <span className="font-medium">Add an expense, outside groups</span>
            </button>

            <button
              onClick={() => chooseMode('personal')}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 text-left"
            >
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Wallet className="h-5 w-5 text-foreground" />
              </div>
              <span className="font-medium">Track your personal expense</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Form dialog */}
      <Dialog open={open && view === 'form'} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setView('choose')} className="p-1 -ml-1 rounded hover:bg-muted">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <DialogTitle className="font-display text-lg">Add Expense</DialogTitle>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium max-w-[40%] truncate">
                {headerLabel}
              </span>
            </div>
          </DialogHeader>

          <div className="px-4 py-4 space-y-4">
            {/* People row */}
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

            {/* Bill tabs */}
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
                      value={activeBill.amount}
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

                <div className="grid grid-cols-2 gap-3">
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
                  {mode !== 'personal' && (
                    <div className="space-y-1.5">
                      <Label>Paid by</Label>
                      <Select value={activeBill.paidBy} onValueChange={(v) => updateBill(activeBill.id, { paidBy: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {people.map((p) => (
                            <SelectItem key={p.user_id} value={p.user_id}>
                              {p.user_id === user?.id ? 'You' : p.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Split */}
                {mode !== 'personal' && (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <Label>Split</Label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-full">
                      <button
                        onClick={() => updateBill(activeBill.id, { splitMode: 'equal' })}
                        className={cn('py-1.5 rounded-full text-sm font-medium',
                          activeBill.splitMode === 'equal' ? 'bg-primary text-primary-foreground' : 'text-foreground')}
                      >Equally</button>
                      <button
                        onClick={() => {
                          updateBill(activeBill.id, { splitMode: 'unequal' });
                          setUnequalOpenFor(activeBill.id);
                        }}
                        className={cn('py-1.5 rounded-full text-sm font-medium',
                          activeBill.splitMode === 'unequal' ? 'bg-primary text-primary-foreground' : 'text-foreground')}
                      >Unequally</button>
                    </div>

                    {activeBill.splitMode === 'equal' ? (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs text-muted-foreground">Split among ( Tap to unselect )</p>
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
                                  'px-3 py-1.5 rounded-full border text-sm',
                                  on
                                    ? 'bg-primary/10 border-primary text-primary'
                                    : 'bg-background border-border text-muted-foreground',
                                )}
                              >
                                {p.user_id === user?.id ? 'You' : p.full_name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button" variant="outline" size="sm"
                        onClick={() => setUnequalOpenFor(activeBill.id)}
                      >
                        Edit unequal split
                      </Button>
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
              {submitting ? 'Submitting...' : `Submit ${bills.length > 1 ? `${bills.length} expenses` : 'expense'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unequal split sheet */}
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