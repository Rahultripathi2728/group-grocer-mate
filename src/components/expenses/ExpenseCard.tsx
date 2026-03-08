import { useState } from 'react';
import { Wallet, Users, CheckCircle2, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCategoryById } from '@/lib/categories';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ExpenseCardProps {
  id: string;
  description: string;
  amount: number;
  expense_type: string;
  expense_date?: string;
  category?: string | null;
  is_settled?: boolean;
  showDate?: boolean;
  compact?: boolean;
  myShare?: number;
  onDelete?: () => void;
}

export default function ExpenseCard({
  id,
  description,
  amount,
  expense_type,
  expense_date,
  category,
  is_settled = false,
  showDate = false,
  compact = false,
  myShare,
  onDelete,
}: ExpenseCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const categoryInfo = getCategoryById(category);
  const CategoryIcon = categoryInfo.icon;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (is_settled) {
      toast.error("Can't delete settled expenses");
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete expense');
    } else {
      toast.success('Expense deleted');
      onDelete?.();
    }
    setDeleting(false);
    setShowDeleteConfirm(false);
  };

  const deleteDialog = (
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            You are about to delete <strong>"{description}"</strong> (₹{amount.toLocaleString('en-IN')}). This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (compact) {
    return (
      <>
        <div className={cn("flex items-center justify-between p-3 rounded-xl bg-card border border-border hover:shadow-sm transition-all duration-200 group/card", is_settled && "opacity-60")}>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', categoryInfo.bgColor)}>
              <CategoryIcon className={cn('h-4 w-4', categoryInfo.color)} />
            </div>
            <div className="min-w-0">
              <p className={cn("font-medium text-sm truncate max-w-[150px]", is_settled && "line-through")}>{description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {showDate && expense_date && <span className="text-xs text-muted-foreground">{format(new Date(expense_date), 'dd MMM')}</span>}
                {is_settled ? (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Settled</span>
                ) : (
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', expense_type === 'personal' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground')}>
                    {expense_type === 'personal' ? 'Personal' : 'Group'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm">₹{amount.toLocaleString('en-IN')}</p>
            {onDelete && !is_settled && (
              <button onClick={handleDeleteClick} disabled={deleting} className="opacity-0 group-hover/card:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {deleteDialog}
      </>
    );
  }

  return (
    <>
      <div className={cn("flex items-center justify-between p-4 rounded-2xl bg-card border border-border hover:shadow-md transition-all duration-300 group/card", is_settled && "opacity-60")}>
        <div className="flex items-center gap-4">
          <div className={cn('p-3 rounded-xl transition-transform duration-300 group-hover/card:scale-110', categoryInfo.bgColor)}>
            <CategoryIcon className={cn('h-5 w-5', categoryInfo.color)} />
          </div>
          <div>
            <p className={cn("font-semibold", is_settled && "line-through")}>{description}</p>
            <div className="flex items-center gap-2 mt-1">
              {showDate && expense_date && <span className="text-sm text-muted-foreground">{format(new Date(expense_date), 'dd MMM yyyy')}</span>}
              {is_settled ? (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-success/10 text-success"><CheckCircle2 className="h-3 w-3" />Settled</span>
              ) : (
                <div className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-full', expense_type === 'personal' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground')}>
                  {expense_type === 'personal' ? <Wallet className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  <span>{expense_type === 'personal' ? 'Personal' : 'Group'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xl font-bold">₹{amount.toLocaleString('en-IN')}</p>
            <p className="text-xs text-muted-foreground mt-1">{categoryInfo.label}</p>
          </div>
          {onDelete && !is_settled && (
            <button onClick={handleDeleteClick} disabled={deleting} className="opacity-0 group-hover/card:opacity-100 p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {deleteDialog}
    </>
  );
}
