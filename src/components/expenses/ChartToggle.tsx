import { useState } from 'react';
import { BarChart3, PieChartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import DailySpendingChart from './DailySpendingChart';
import CategoryPieChart from './CategoryPieChart';

interface ChartToggleProps {
  expenses: Array<{
    id: string;
    amount: number;
    expense_date: string;
    expense_type: string;
    category?: string | null;
    myShare?: number;
  }>;
  dateFrom?: Date;
  dateTo?: Date;
}

export default function ChartToggle({ expenses, dateFrom, dateTo }: ChartToggleProps) {
  const [view, setView] = useState<'daily' | 'category'>('daily');

  return (
    <div className="space-y-3">
      {/* Toggle pills */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-xl w-fit">
        <button
          onClick={() => setView('daily')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            view === 'daily'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Daily Trend
        </button>
        <button
          onClick={() => setView('category')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            view === 'category'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <PieChartIcon className="h-3.5 w-3.5" />
          Categories
        </button>
      </div>

      {/* Chart content */}
      <AnimatePresence mode="wait">
        {view === 'daily' ? (
          <motion.div
            key="daily"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
          >
            <DailySpendingChart expenses={expenses} dateFrom={dateFrom} dateTo={dateTo} />
          </motion.div>
        ) : (
          <motion.div
            key="category"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <CategoryPieChart expenses={expenses} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
