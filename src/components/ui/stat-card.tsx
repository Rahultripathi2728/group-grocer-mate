import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  className?: string;
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = 'text-primary',
  iconBgColor = 'bg-primary/10',
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden p-4 sm:p-6 rounded-2xl bg-card border border-border',
        'hover:shadow-md transition-all duration-300',
        'group',
        className
      )}
    >
      {/* Background decoration */}
      <div
        className={cn(
          'absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-30',
          iconBgColor
        )}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="space-y-1 sm:space-y-2 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</p>
          <p className="text-xl sm:text-3xl font-display font-bold tracking-tight truncate">{value}</p>
          {trend && (
            <div
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
                trend.positive
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              <span>{trend.positive ? '↑' : '↓'}</span>
              <span>
                {trend.value}% {trend.label}
              </span>
            </div>
          )}
        </div>
        <div
          className={cn(
            'p-2 sm:p-3 rounded-xl transition-transform duration-300 group-hover:scale-110 shrink-0',
            iconBgColor
          )}
        >
          <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', iconColor)} />
        </div>
      </div>
    </div>
  );
}
