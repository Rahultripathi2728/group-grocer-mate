import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowDown, ArrowUp, HandCoins, CheckCircle2, Trash2, UserCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Loan {
  id: string;
  creator_id: string;
  counterparty_user_id: string | null;
  counterparty_name: string | null;
  counterparty_contact: string | null;
  direction: 'lent' | 'borrowed';
  amount: number;
  description: string | null;
  loan_date: string;
  is_settled: boolean;
  otherName: string;
}

export default function LoansCard() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [showSettled, setShowSettled] = useState(false);
  const [confirmSettle, setConfirmSettle] = useState<Loan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Loan | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('loans')
      .select('*')
      .order('loan_date', { ascending: false });
    if (!data) { setLoans([]); return; }
    const otherIds = [...new Set(data.map((l) => l.counterparty_user_id).filter(Boolean) as string[])];
    const profMap = new Map<string, string>();
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from('profiles').select('id, full_name').in('id', otherIds);
      (profs || []).forEach((p: any) => profMap.set(p.id, p.full_name));
    }
    setLoans(data.map((l: any) => {
      // For records where I'm counterparty (other person created), flip direction perspective
      const isMine = l.creator_id === user.id;
      const otherName = isMine
        ? (l.counterparty_user_id ? (profMap.get(l.counterparty_user_id) || 'User') : (l.counterparty_name || 'Unknown'))
        : (profMap.get(l.creator_id) || 'User');
      const direction: 'lent' | 'borrowed' = isMine ? l.direction : (l.direction === 'lent' ? 'borrowed' : 'lent');
      return { ...l, amount: Number(l.amount), direction, otherName };
    }));
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const settle = async (loan: Loan) => {
    const { error } = await supabase.from('loans')
      .update({ is_settled: true, settled_at: new Date().toISOString() })
      .eq('id', loan.id);
    if (error) toast.error('Failed'); else { toast.success('Marked as settled!'); await load(); }
    setConfirmSettle(null);
  };

  const remove = async (loan: Loan) => {
    const { error } = await supabase.from('loans').delete().eq('id', loan.id);
    if (error) toast.error('Failed'); else { toast.success('Deleted'); await load(); }
    setConfirmDelete(null);
  };

  const active = loans.filter((l) => !l.is_settled);
  const settled = loans.filter((l) => l.is_settled);
  const totalLent = active.filter((l) => l.direction === 'lent').reduce((s, l) => s + l.amount, 0);
  const totalBorrowed = active.filter((l) => l.direction === 'borrowed').reduce((s, l) => s + l.amount, 0);

  if (loans.length === 0) return null;

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-display flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-muted-foreground" />
          Loans ({active.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Totals */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-success/5 border border-success/15">
            <p className="text-[10px] text-muted-foreground">To Receive</p>
            <p className="text-base font-bold text-success">₹{totalLent.toFixed(0)}</p>
          </div>
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/15">
            <p className="text-[10px] text-muted-foreground">To Pay</p>
            <p className="text-base font-bold text-destructive">₹{totalBorrowed.toFixed(0)}</p>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {(showSettled ? loans : active).map((l) => (
            <div key={l.id} className={cn(
              'flex items-center gap-2 p-2.5 rounded-lg border',
              l.is_settled ? 'opacity-50 bg-muted/30 border-border' :
              l.direction === 'lent' ? 'bg-success/5 border-success/15' : 'bg-destructive/5 border-destructive/15'
            )}>
              <div className={cn(
                'p-1.5 rounded-lg',
                l.direction === 'lent' ? 'bg-success/15' : 'bg-destructive/15'
              )}>
                {l.direction === 'lent'
                  ? <ArrowUp className="h-3.5 w-3.5 text-success" />
                  : <ArrowDown className="h-3.5 w-3.5 text-destructive" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium truncate">{l.otherName}</p>
                  {!l.counterparty_user_id && <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">manual</span>}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {l.direction === 'lent' ? 'You gave' : 'You took'} • {format(new Date(l.loan_date), 'dd MMM')}
                  {l.description ? ` • ${l.description}` : ''}
                </p>
              </div>
              <p className={cn('text-sm font-bold shrink-0',
                l.direction === 'lent' ? 'text-success' : 'text-destructive')}>
                ₹{l.amount.toFixed(0)}
              </p>
              {!l.is_settled && (
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmSettle(l)}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </Button>
                  {l.creator_id === user?.id && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDelete(l)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {settled.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowSettled(!showSettled)}>
            {showSettled ? 'Hide settled' : `Show ${settled.length} settled`}
          </Button>
        )}
      </CardContent>

      <AlertDialog open={!!confirmSettle} onOpenChange={(o) => !o && setConfirmSettle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Settled?</AlertDialogTitle>
            <AlertDialogDescription>
              ₹{confirmSettle?.amount.toFixed(0)} {confirmSettle?.direction === 'lent' ? 'received from' : 'paid to'} {confirmSettle?.otherName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmSettle && settle(confirmSettle)}>Settle</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && remove(confirmDelete)}
              className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
