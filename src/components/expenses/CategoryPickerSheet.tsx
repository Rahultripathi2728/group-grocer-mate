import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addCustomCategory, categoryList, getCustomCategories, removeCustomCategory } from '@/lib/categories';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: string;
  onSelect: (id: string) => void;
}

export default function CategoryPickerSheet({ open, onOpenChange, value, onSelect }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [version, setVersion] = useState(0);

  const custom = useMemo(() => getCustomCategories(), [version, open]);
  const all = useMemo(() => [...categoryList, ...custom], [custom]);

  const create = () => {
    if (!name.trim()) return;
    const id = addCustomCategory(name);
    setName('');
    setCreating(false);
    setVersion((v) => v + 1);
    onSelect(id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[80dvh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-lg">Choose a category</SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-4 gap-3 pt-4 pb-2">
          {all.map((c, i) => {
            const Icon = c.icon;
            const active = c.id === value;
            const isCustom = c.id.startsWith('custom_');
            return (
              <motion.button
                key={c.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.3) }}
                whileTap={{ scale: 0.94 }}
                onClick={() => { onSelect(c.id); onOpenChange(false); }}
                className="relative flex flex-col items-center gap-1.5 group"
              >
                <span
                  className={cn(
                    'h-16 w-16 rounded-full flex items-center justify-center transition-all',
                    c.bgColor,
                    active ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'ring-0',
                  )}
                >
                  <Icon className={cn('h-7 w-7', c.color)} />
                </span>
                {active && (
                  <span className="absolute top-0 right-1 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <span className="text-[11px] text-center leading-tight line-clamp-2">{c.label}</span>
                {isCustom && (
                  <span
                    role="button"
                    aria-label={`Remove ${c.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustomCategory(c.id);
                      setVersion((v) => v + 1);
                      if (value === c.id) onSelect('general');
                    }}
                    className="absolute -top-1 -left-1 h-5 w-5 rounded-full bg-muted border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </motion.button>
            );
          })}

          {/* Create new */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => setCreating(true)}
            className="flex flex-col items-center gap-1.5"
          >
            <span className="h-16 w-16 rounded-full border-2 border-dashed border-border flex items-center justify-center">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </span>
            <span className="text-[11px] text-muted-foreground">New</span>
          </motion.button>
        </div>

        {creating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-2 pb-4">
            <div className="flex gap-2">
              <Input
                autoFocus
                maxLength={24}
                placeholder="Category name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
              <Button onClick={create} disabled={!name.trim()}>Add</Button>
            </div>
          </motion.div>
        )}
      </SheetContent>
    </Sheet>
  );
}
