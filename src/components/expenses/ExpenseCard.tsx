import { Wallet, Users, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCategoryById } from '@/lib/categories';
import { format } from 'date-fns';

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
}

export default function ExpenseCard({
  description,
  amount,
  expense_type,
  expense_date,
  category,
  is_settled = false,
  showDate = false,
  compact = false,
}: ExpenseCardProps) {
  const categoryInfo = getCategoryById(category);
  const CategoryIcon = categoryInfo.icon;

  if (compact) {
    return (
      <div className={cn(
        "flex items-center justify-between p-3 rounded-xl bg-card border border-border/50 hover:border-border hover:shadow-sm transition-all duration-200",
        is_settled && "opacity-60"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', categoryInfo.bgColor)}>
            <CategoryIcon className={cn('h-4 w-4', categoryInfo.color)} />
          </div>
          <div className="min-w-0">
            <p className={cn("font-medium text-sm truncate max-w-[150px]", is_settled && "line-through")}>{description}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {showDate && expense_date && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(expense_date), 'dd MMM')}
                </span>
              )}
              {is_settled ? (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Settled
                </span>
              ) : (
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    expense_type === 'personal'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-accent text-accent-foreground'
                  )}
                >
                  {expense_type === 'personal' ? 'Personal' : 'Group'}
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="font-bold text-sm">₹{amount.toLocaleString('en-IN')}</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-2xl bg-card border border-border/50 hover:border-border hover:shadow-md transition-all duration-300 group",
      is_settled && "opacity-60"
    )}>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'p-3 rounded-xl transition-transform duration-300 group-hover:scale-110',
            categoryInfo.bgColor
          )}
        >
          <CategoryIcon className={cn('h-5 w-5', categoryInfo.color)} />
        </div>
        <div>
          <p className={cn("font-semibold", is_settled && "line-through")}>{description}</p>
          <div className="flex items-center gap-2 mt-1">
            {showDate && expense_date && (
              <span className="text-sm text-muted-foreground">
                {format(new Date(expense_date), 'dd MMM yyyy')}
              </span>
            )}
            {is_settled ? (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-3 w-3" />
                Settled
              </span>
            ) : (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs px-2 py-1 rounded-full',
                  expense_type === 'personal'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-accent text-accent-foreground'
                )}
              >
                {expense_type === 'personal' ? (
                  <Wallet className="h-3 w-3" />
                ) : (
                  <Users className="h-3 w-3" />
                )}
                <span>{expense_type === 'personal' ? 'Personal' : 'Group'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold">₹{amount.toLocaleString('en-IN')}</p>
        <p className="text-xs text-muted-foreground mt-1">{categoryInfo.label}</p>
      </div>
    </div>
  );
}
