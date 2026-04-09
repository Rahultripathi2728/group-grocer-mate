import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChartIcon } from 'lucide-react';
import { getCategoryById, categoryList } from '@/lib/categories';
import { motion } from 'framer-motion';

interface Expense {
  id: string;
  amount: number;
  expense_type: string;
  category?: string | null;
  myShare?: number;
}

interface CategoryPieChartProps {
  expenses: Expense[];
}

const COLORS = [
  'hsl(24, 95%, 53%)',   // food - orange
  'hsl(217, 91%, 60%)',  // transport - blue
  'hsl(48, 96%, 53%)',   // utilities - yellow
  'hsl(271, 91%, 65%)',  // entertainment - purple
  'hsl(330, 81%, 60%)',  // shopping - pink
  'hsl(0, 84%, 60%)',    // health - red
  'hsl(168, 76%, 42%)',  // other - teal
  'hsl(215, 16%, 47%)',  // general - gray
];

export default function CategoryPieChart({ expenses }: CategoryPieChartProps) {
  const chartData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};

    expenses.forEach((e) => {
      const cat = e.category || 'general';
      const amount = e.expense_type === 'group' ? (e.myShare ?? e.amount) : e.amount;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
    });

    return Object.entries(categoryTotals)
      .map(([catId, total]) => ({
        id: catId,
        name: getCategoryById(catId).label,
        value: Math.round(total),
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0];
    const percent = ((data.value / total) * 100).toFixed(1);
    return (
      <div className="rounded-xl border border-border/50 bg-card px-3 py-2 shadow-lg text-xs space-y-0.5">
        <p className="font-medium text-foreground">{data.name}</p>
        <p className="text-primary">₹{data.value.toLocaleString('en-IN')}</p>
        <p className="text-muted-foreground">{percent}%</p>
      </div>
    );
  };

  if (chartData.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
      <Card className="border border-border shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <div className="p-2 rounded-xl bg-muted">
            <PieChartIcon className="h-4 w-4 text-foreground" />
          </div>
          <CardTitle className="font-display text-base">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-2 text-xs text-muted-foreground">
            {chartData.map((entry, index) => (
              <div key={entry.id} className="flex items-center gap-1.5">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span>{entry.name}</span>
                <span className="font-medium text-foreground">₹{entry.value.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
