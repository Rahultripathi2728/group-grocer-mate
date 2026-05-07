import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Wallet, Users, HandCoins, Sparkles, ChevronLeft, ArrowDown, ArrowUp, UserCircle2 } from 'lucide-react';
import { detectCategory } from '@/lib/categories';
import { cn } from '@/lib/utils';

type Mode = 'personal' | 'split' | 'borrow';
type SplitSource = 'group' | 'friends';
type BorrowDir = 'lent' | 'borrowed';
type BorrowTarget = 'friend' | 'manual';

interface Group { id: string; name: string; }
interface Friend { user_id: string; full_name: string; username: string | null; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  selectedDate?: Date;
}

export default function AddExpenseDialog({ open, onOpenChange, onSuccess, selectedDate }: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('personal');
  const [loading, setLoading] = useState(false);

  // Common fields
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(selectedDate || new Date(), 'yyyy-MM-dd'));
  const [category, setCategory] = useState('general');
  const [autoDetected, setAutoDetected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Split-specific
  const [splitSource, setSplitSource] = useState<SplitSource>('friends');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  // Borrow-specific
  const [borrowDir, setBorrowDir] = useState<BorrowDir>('lent');
  const [borrowTarget, setBorrowTarget] = useState<BorrowTarget>('friend');
  const [borrowFriendId, setBorrowFriendId] = useState<string>('');
  const [manualName, setManualName] = useState('');
  const [manualContact, setManualContact] = useState('');

  useEffect(() => {
    if (open && user) {
      // reset
      setMode('personal');
      setDescription('');
      setAmount('');
      setDate(format(selectedDate || new Date(), 'yyyy-MM-dd'));
      setCategory('general');
      setAutoDetected(false);
      setSplitSource('friends');
      setSelectedGroup('');
      setSelectedFriends(new Set());
      setBorrowDir('lent');
      setBorrowTarget('friend');
      setBorrowFriendId('');
      setManualName('');
      setManualContact('');
      void loadGroups();
      void loadFriends();
    }
  }, [open, user, selectedDate]);

  const loadGroups = async () => {
    if (!user) return;
    const [{ data: owned }, { data: memberships }] = await Promise.all([
      supabase.from('groups').select('id, name').eq('owner_id', user.id),
      supabase.from('group_memberships').select('groups(id, name)').eq('user_id', user.id),
    ]);
    const memberGroups = (memberships || []).map((m: any) => m.groups).filter(Boolean);
    const all = [...(owned || []), ...memberGroups];
    setGroups(all.filter((g, i, s) => s.findIndex((x) => x.id === g.id) === i));
  };

  const loadFriends = async () => {
    if (!user) return;
    const { data: rels } = await supabase
      .from('friendships')
      .select('requester_id, receiver_id')
      .eq('status', 'accepted');
    const friendIds = (rels || []).map((r) =>
      r.requester_id === user.id ? r.receiver_id : r.requester_id
    );
    if (friendIds.length === 0) { setFriends([]); return; }
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', friendIds);
    setFriends((profs || []).map((p: any) => ({
      user_id: p.id, full_name: p.full_name, username: p.username,
    })));
  };

  const handleDescChange = (val: string) => {
    setDescription(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const detected = detectCategory(val);
      if (detected) { setCategory(detected); setAutoDetected(true); }
      else setAutoDetected(false);
    }, 300);
  };

  const validateCommon = () => {
    const desc = description.trim().slice(0, 500);
    const amt = parseFloat(amount);
    if (!desc) { toast.error('Description required'); return null; }
    if (isNaN(amt) || amt <= 0 || amt > 99999999) {
      toast.error('Amount must be between 0.01 and 99,999,999'); return null;
    }
    return { desc, amt: Math.round(amt * 100) / 100 };
  };

  const submitPersonal = async () => {
    if (!user) return;
    const v = validateCommon(); if (!v) return;
    setLoading(true);
    const { error } = await supabase.from('expenses').insert({
      user_id: user.id, description: v.desc, amount: v.amt,
      expense_date: date, expense_type: 'personal',
      category: category || 'general', group_id: null,
    });
    setLoading(false);
    if (error) { toast.error('Failed to add expense'); return; }
    toast.success('Personal expense added!');
    onSuccess(); onOpenChange(false);
  };

  const submitSplit = async () => {
    if (!user) return;
    const v = validateCommon(); if (!v) return;

    let memberIds: string[] = [];
    let expensePayload: any = {
      user_id: user.id, description: v.desc, amount: v.amt,
      expense_date: date, category: category || 'general',
    };

    if (splitSource === 'group') {
      if (!selectedGroup) { toast.error('Select a group'); return; }
      const [{ data: members }, { data: g }] = await Promise.all([
        supabase.from('group_memberships').select('user_id').eq('group_id', selectedGroup),
        supabase.from('groups').select('owner_id').eq('id', selectedGroup).single(),
      ]);
      memberIds = [...(members || []).map((m) => m.user_id), g?.owner_id].filter(Boolean) as string[];
      memberIds = [...new Set(memberIds)];
      expensePayload.expense_type = 'group';
      expensePayload.group_id = selectedGroup;
    } else {
      if (selectedFriends.size === 0) { toast.error('Select at least one person'); return; }
      memberIds = [user.id, ...Array.from(selectedFriends)];
      expensePayload.expense_type = 'shared';
      expensePayload.group_id = null;
    }

    setLoading(true);
    const { data: expense, error } = await supabase
      .from('expenses').insert(expensePayload).select().single();
    if (error || !expense) {
      setLoading(false);
      toast.error('Failed to add expense'); return;
    }

    const splitAmt = v.amt / memberIds.length;
    const splits = memberIds.map((uid) => ({
      expense_id: expense.id, user_id: uid,
      amount_owed: splitAmt, is_paid: uid === user.id,
    }));
    const { error: sErr } = await supabase.from('expense_splits').insert(splits);
    setLoading(false);
    if (sErr) { toast.error('Failed to create splits'); return; }
    toast.success(`Split among ${memberIds.length} people!`);
    onSuccess(); onOpenChange(false);
  };

  const submitBorrow = async () => {
    if (!user) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || amt > 99999999) {
      toast.error('Amount must be between 0.01 and 99,999,999'); return;
    }
    if (borrowTarget === 'friend' && !borrowFriendId) {
      toast.error('Select a person'); return;
    }
    if (borrowTarget === 'manual' && !manualName.trim()) {
      toast.error('Enter person\'s name'); return;
    }
    setLoading(true);
    const { error } = await supabase.from('loans').insert({
      creator_id: user.id,
      counterparty_user_id: borrowTarget === 'friend' ? borrowFriendId : null,
      counterparty_name: borrowTarget === 'manual' ? manualName.trim().slice(0, 100) : null,
      counterparty_contact: borrowTarget === 'manual' && manualContact.trim()
        ? manualContact.trim().slice(0, 50) : null,
      direction: borrowDir,
      amount: Math.round(amt * 100) / 100,
      description: description.trim().slice(0, 500) || null,
      loan_date: date,
    });
    setLoading(false);
    if (error) { toast.error('Failed to record loan'); return; }
    toast.success(borrowDir === 'lent' ? 'Money lent recorded!' : 'Borrowing recorded!');
    onSuccess(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {mode === 'personal' && 'Add Personal Expense'}
            {mode === 'split' && 'Settle / Split Expense'}
            {mode === 'borrow' && 'Borrow Money'}
          </DialogTitle>
        </DialogHeader>

        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setMode('personal')}
            className={cn('flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all',
              mode === 'personal' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50')}>
            <Wallet className="h-4 w-4" /><span className="text-xs font-medium">Personal</span>
          </button>
          <button type="button" onClick={() => setMode('split')}
            className={cn('flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all',
              mode === 'split' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50')}>
            <Users className="h-4 w-4" /><span className="text-xs font-medium">Settle</span>
          </button>
          <button type="button" onClick={() => setMode('borrow')}
            className={cn('flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all',
              mode === 'borrow' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50')}>
            <HandCoins className="h-4 w-4" /><span className="text-xs font-medium">Borrow</span>
          </button>
        </div>

        {/* PERSONAL */}
        {mode === 'personal' && (
          <div className="space-y-4">
            <CommonFields
              description={description} onDescChange={handleDescChange}
              amount={amount} setAmount={setAmount}
              date={date} setDate={setDate}
              category={category} setCategory={(v) => { setCategory(v); setAutoDetected(false); }}
              autoDetected={autoDetected}
            />
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
              <Button onClick={submitPersonal} disabled={loading}
                className="flex-1 bg-foreground text-background hover:bg-foreground/90">
                {loading ? 'Adding...' : 'Add Expense'}
              </Button>
            </div>
          </div>
        )}

        {/* SPLIT */}
        {mode === 'split' && (
          <div className="space-y-4">
            <Tabs value={splitSource} onValueChange={(v) => setSplitSource(v as SplitSource)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="friends">Pick People</TabsTrigger>
                <TabsTrigger value="group">Existing Group</TabsTrigger>
              </TabsList>
              <TabsContent value="friends" className="mt-3 space-y-2">
                {friends.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No friends yet. Add friends from the Groups page first.
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                    {friends.map((f) => (
                      <label key={f.user_id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={selectedFriends.has(f.user_id)}
                          onCheckedChange={(c) => {
                            const s = new Set(selectedFriends);
                            if (c) s.add(f.user_id); else s.delete(f.user_id);
                            setSelectedFriends(s);
                          }}
                        />
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">
                            {f.full_name?.[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.full_name}</p>
                          {f.username && <p className="text-[10px] text-muted-foreground">@{f.username}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  You + {selectedFriends.size} other{selectedFriends.size !== 1 ? 's' : ''} = split equally
                </p>
              </TabsContent>
              <TabsContent value="group" className="mt-3">
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger><SelectValue placeholder="Choose a group" /></SelectTrigger>
                  <SelectContent>
                    {groups.length === 0
                      ? <SelectItem value="none" disabled>No groups available</SelectItem>
                      : groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TabsContent>
            </Tabs>

            <CommonFields
              description={description} onDescChange={handleDescChange}
              amount={amount} setAmount={setAmount}
              date={date} setDate={setDate}
              category={category} setCategory={(v) => { setCategory(v); setAutoDetected(false); }}
              autoDetected={autoDetected}
            />
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
              <Button onClick={submitSplit} disabled={loading}
                className="flex-1 bg-foreground text-background hover:bg-foreground/90">
                {loading ? 'Adding...' : 'Add & Split'}
              </Button>
            </div>
          </div>
        )}

        {/* BORROW */}
        {mode === 'borrow' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setBorrowDir('lent')}
                className={cn('flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all',
                  borrowDir === 'lent' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>
                <ArrowUp className="h-4 w-4" /><span className="text-sm font-medium">I Lent</span>
              </button>
              <button type="button" onClick={() => setBorrowDir('borrowed')}
                className={cn('flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all',
                  borrowDir === 'borrowed' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>
                <ArrowDown className="h-4 w-4" /><span className="text-sm font-medium">I Borrowed</span>
              </button>
            </div>

            <Tabs value={borrowTarget} onValueChange={(v) => setBorrowTarget(v as BorrowTarget)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="friend">App User</TabsTrigger>
                <TabsTrigger value="manual">Other Person</TabsTrigger>
              </TabsList>
              <TabsContent value="friend" className="mt-3">
                {friends.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No friends yet. Add friends from the Groups page first.
                  </p>
                ) : (
                  <Select value={borrowFriendId} onValueChange={setBorrowFriendId}>
                    <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
                    <SelectContent>
                      {friends.map((f) => (
                        <SelectItem key={f.user_id} value={f.user_id}>
                          {f.full_name}{f.username ? ` (@${f.username})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </TabsContent>
              <TabsContent value="manual" className="mt-3 space-y-2">
                <div>
                  <Label className="text-xs">Person's Name *</Label>
                  <Input value={manualName} onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. Rohit" maxLength={100} />
                </div>
                <div>
                  <Label className="text-xs">Phone / Contact (optional)</Label>
                  <Input value={manualContact} onChange={(e) => setManualContact(e.target.value)}
                    placeholder="e.g. 9876543210" maxLength={50} />
                </div>
              </TabsContent>
            </Tabs>

            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="What was it for?" rows={2} className="resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount (₹) *</Label>
                <Input type="number" step="0.01" min="0" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
              <Button onClick={submitBorrow} disabled={loading}
                className="flex-1 bg-foreground text-background hover:bg-foreground/90">
                {loading ? 'Saving...' : (borrowDir === 'lent' ? 'Record Lending' : 'Record Borrowing')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CommonFields({
  description, onDescChange, amount, setAmount, date, setDate,
  category, setCategory, autoDetected,
}: {
  description: string; onDescChange: (v: string) => void;
  amount: string; setAmount: (v: string) => void;
  date: string; setDate: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  autoDetected: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} required
          placeholder="What did you buy? (e.g., Biryani, Uber)"
          rows={2} className="resize-none"
          onChange={(e) => onDescChange(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input id="amount" type="number" step="0.01" min="0" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={date}
            onChange={(e) => setDate(e.target.value)} required className="h-11" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="category">Category</Label>
          {autoDetected && (
            <span className="flex items-center gap-1 text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded-full">
              <Sparkles className="h-3 w-3" />Auto-detected
            </span>
          )}
        </div>
        <Select value={category} onValueChange={setCategory}>
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
    </>
  );
}
