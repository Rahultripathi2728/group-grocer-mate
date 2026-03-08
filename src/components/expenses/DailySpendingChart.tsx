import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { motion } from 'framer-motion';

interface Expense {
  id: string;
  amount: number;
  expense_date: string;
  expense_type: string;
}

interface DailySpendingChartProps {
  expenses: Expense[];
}

export default function DailySpendingChart({ expenses }: DailySpendingChartProps) {
  const chartData = useMemo(() => {
    const now = new Date();
    const days = eachDayOfInterval({
      start: startOfMonth(now),
      end: now > endOfMonth(now) ? endOfMonth(now) : now,
    });

    return days.map((day) => {
      const dayExpenses = expenses.filter((e) =>
        isSameDay(new Date(e.expense_date), day)
      );
      const personal = dayExpenses
        .filter((e) => e.expense_type === 'personal')
        .reduce((s, e) => s + e.amount, 0);
      const group = dayExpenses
        .filter((e) => e.expense_type === 'group')
        .reduce((s, e) => s + e.amount, 0);

      return {
        date: format(day, 'dd'),
        label: format(day, 'dd MMM'),
        personal,
        group,
        total: personal + group,
      };
    });
  }, [expenses]);

  const maxVal = Math.max(...chartData.map((d) => d.total), 1);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    return (
      <div className="rounded-xl border border-border/50 bg-card px-3 py-2 shadow-lg text-xs space-y-1">
        <p className="font-medium text-foreground">{data?.label}</p>
        {data?.personal > 0 && (
          <p className="text-primary">Personal: ₹{data.personal.toLocaleString('en-IN')}</p>
        )}
        {data?.group > 0 && (
          <p className="text-accent-foreground">Group: ₹{data.group.toLocaleString('en-IN')}</p>
        )}
        <p className="font-semibold text-foreground">Total: ₹{data?.total.toLocaleString('en-IN')}</p>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
      <Card className="border border-border shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <div className="p-2 rounded-xl bg-muted">
            <BarChart3 className="h-4 w-4 text-foreground" />
          </div>
          <CardTitle className="font-display text-base">Daily Spending</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillPersonal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(162, 63%, 41%)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(162, 63%, 41%)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillGroup" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(262, 60%, 55%)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(262, 60%, 55%)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="personal"
                  stackId="1"
                  stroke="hsl(162, 63%, 41%)"
                  fill="url(#fillPersonal)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="group"
                  stackId="1"
                  stroke="hsl(262, 60%, 55%)"
                  fill="url(#fillGroup)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              Personal
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(262, 60%, 55%)' }} />
              Group
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
