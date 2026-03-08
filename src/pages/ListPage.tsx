import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Check, Sparkles, Users, ClipboardList, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ListItem {
  id: string;
  name: string;
  quantity: number | null;
  is_checked: boolean;
  created_at: string;
  added_by: string | null;
  list_id: string;
}

interface GroceryList {
  id: string;
  name: string;
  group_id: string | null;
  group_name?: string;
  items: ListItem[];
}

interface FlatItem extends ListItem {
  isGroup: boolean;
  groupName?: string;
}

interface Group {
  id: string;
  name: string;
}

export default function ListPage() {
  const { user } = useAuth();
  const [allLists, setAllLists] = useState<GroceryList[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  // Add item dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [addItemTarget, setAddItemTarget] = useState<string>('personal');

  const fetchData = async () => {
    if (!user) return;

    const [personalResult, groupListsResult, ownedGroupsResult, membershipsResult] = await Promise.all([
      supabase.from('grocery_lists').select('*').eq('user_id', user.id).is('group_id', null),
      supabase.from('grocery_lists').select('*, groups(name)').not('group_id', 'is', null),
      supabase.from('groups').select('id, name').eq('owner_id', user.id),
      supabase.from('group_memberships').select('group_id, groups(id, name)').eq('user_id', user.id),
    ]);

    const memberGroups = membershipsResult.data?.map((m) => m.groups).filter(Boolean) || [];
    const allGroups = [...(ownedGroupsResult.data || []), ...memberGroups.map((g: any) => g)];
    const uniqueGroups = allGroups.filter((group, index, self) => index === self.findIndex((g) => g.id === group.id));
    setGroups(uniqueGroups);

    const lists: GroceryList[] = [];

    // Fetch all items in parallel
    const allListData = [...(personalResult.data || []), ...(groupListsResult.data || [])];
    const itemPromises = allListData.map((list) =>
      supabase.from('grocery_items').select('*').eq('list_id', list.id).order('created_at', { ascending: true })
    );
    const itemResults = await Promise.all(itemPromises);

    allListData.forEach((list, i) => {
      lists.push({
        ...list,
        group_name: list.group_id ? (list as any).groups?.name || 'Group' : undefined,
        items: itemResults[i].data || [],
      });
    });

    setAllLists(lists);
    setLoading(false);
  };

  // Realtime for group lists
  const handleRealtimeUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    setAllLists((prevLists) =>
      prevLists.map((list) => {
        if (eventType === 'INSERT' && newRecord.list_id === list.id) {
          if (list.items.some((item) => item.id === newRecord.id)) return list;
          return { ...list, items: [...list.items, newRecord as ListItem] };
        }
        if (eventType === 'UPDATE' && newRecord.list_id === list.id) {
          return { ...list, items: list.items.map((item) => (item.id === newRecord.id ? (newRecord as ListItem) : item)) };
        }
        if (eventType === 'DELETE' && oldRecord.list_id === list.id) {
          return { ...list, items: list.items.filter((item) => item.id !== oldRecord.id) };
        }
        return list;
      })
    );
  }, []);

  useEffect(() => { fetchData(); }, [user]);

  useEffect(() => {
    const groupLists = allLists.filter((l) => l.group_id);
    if (groupLists.length === 0) return;
    const channels = groupLists.map((list) =>
      supabase
        .channel(`grocery-items-${list.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_items', filter: `list_id=eq.${list.id}` }, handleRealtimeUpdate)
        .subscribe()
    );
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)); };
  }, [allLists.map((l) => l.id).join(','), handleRealtimeUpdate]);

  // Get or create a personal list
  const getOrCreatePersonalList = async (): Promise<string | null> => {
    const personalList = allLists.find((l) => !l.group_id);
    if (personalList) return personalList.id;

    const { data, error } = await supabase
      .from('grocery_lists')
      .insert({ user_id: user!.id, name: 'Personal List' })
      .select()
      .single();
    if (error || !data) { toast.error('Failed to create list'); return null; }

    setAllLists((prev) => [...prev, { ...data, group_name: undefined, items: [] }]);
    return data.id;
  };

  // Get or create a group list
  const getOrCreateGroupList = async (groupId: string): Promise<string | null> => {
    const groupList = allLists.find((l) => l.group_id === groupId);
    if (groupList) return groupList.id;

    const group = groups.find((g) => g.id === groupId);
    const { data, error } = await supabase
      .from('grocery_lists')
      .insert({ user_id: user!.id, name: `${group?.name || 'Group'} List`, group_id: groupId })
      .select()
      .single();
    if (error || !data) { toast.error('Failed to create list'); return null; }

    setAllLists((prev) => [...prev, { ...data, group_name: group?.name, items: [] }]);
    return data.id;
  };

  const addItem = async () => {
    if (!user || !newItemName.trim()) return;

    let listId: string | null = null;
    if (addItemTarget === 'personal') {
      listId = await getOrCreatePersonalList();
    } else {
      listId = await getOrCreateGroupList(addItemTarget);
    }
    if (!listId) return;

    const { data, error } = await supabase
      .from('grocery_items')
      .insert({ list_id: listId, name: newItemName.trim(), quantity: 1, added_by: user.id })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add item');
    } else {
      setAllLists((prev) =>
        prev.map((list) => (list.id === listId ? { ...list, items: [...list.items, data] } : list))
      );
      setNewItemName('');
      setAddDialogOpen(false);
      toast.success('Item added!');
    }
  };

  const toggleItem = async (listId: string, itemId: string, isChecked: boolean) => {
    const { error } = await supabase.from('grocery_items').update({ is_checked: !isChecked }).eq('id', itemId);
    if (!error) {
      setAllLists((prev) =>
        prev.map((list) =>
          list.id === listId
            ? { ...list, items: list.items.map((item) => (item.id === itemId ? { ...item, is_checked: !isChecked } : item)) }
            : list
        )
      );
    }
  };

  const deleteItem = async (listId: string, itemId: string) => {
    const { error } = await supabase.from('grocery_items').delete().eq('id', itemId);
    if (!error) {
      setAllLists((prev) =>
        prev.map((list) => (list.id === listId ? { ...list, items: list.items.filter((item) => item.id !== itemId) } : list))
      );
    }
  };

  const clearChecked = async () => {
    const checkedItems = allLists.flatMap((l) => l.items.filter((i) => i.is_checked).map((i) => ({ id: i.id, listId: l.id })));
    if (checkedItems.length === 0) return;
    const { error } = await supabase.from('grocery_items').delete().in('id', checkedItems.map((i) => i.id));
    if (!error) {
      setAllLists((prev) =>
        prev.map((list) => ({ ...list, items: list.items.filter((item) => !item.is_checked) }))
      );
      toast.success('Cleared checked items!');
    }
  };

  // Flatten all items with group info
  const flatItems: FlatItem[] = allLists.flatMap((list) =>
    list.items.map((item) => ({
      ...item,
      isGroup: !!list.group_id,
      groupName: list.group_name,
    }))
  );

  const uncheckedItems = flatItems.filter((i) => !i.is_checked);
  const checkedItems = flatItems.filter((i) => i.is_checked);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-display font-bold"
            >
              My Lists
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-muted-foreground mt-1"
            >
              {uncheckedItems.length} item{uncheckedItems.length !== 1 ? 's' : ''} remaining
            </motion.p>
          </div>
          <Button
            onClick={() => setAddDialogOpen(true)}
            size="icon"
            className="bg-foreground text-background rounded-xl h-12 w-12 shadow-sm hover:bg-foreground/90"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Items */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : flatItems.length === 0 ? (
          <Card className="border border-border shadow-sm">
            <CardContent className="pt-16 pb-16 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex p-6 rounded-full bg-primary/10 mb-6"
              >
                <ClipboardList className="h-12 w-12 text-primary" />
              </motion.div>
              <h3 className="text-xl font-display font-semibold mb-2">No items yet</h3>
              <p className="text-muted-foreground mb-6">Tap + to add your first item</p>
              <Button onClick={() => setAddDialogOpen(true)} className="bg-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {/* Clear checked button */}
            {checkedItems.length > 0 && (
              <div className="flex justify-end mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearChecked}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear checked ({checkedItems.length})
                </Button>
              </div>
            )}

            {/* Unchecked items */}
            <AnimatePresence>
              {uncheckedItems.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="group flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:border-border transition-all"
                >
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => toggleItem(item.list_id, item.id, false)}
                    className="h-5 w-5 rounded-md"
                  />
                  <span className="flex-1 font-medium">{item.name}</span>
                  <Badge
                    variant={item.isGroup ? 'secondary' : 'outline'}
                    className="text-[10px] px-1.5 py-0 shrink-0"
                  >
                    {item.isGroup ? item.groupName : 'Private'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => deleteItem(item.list_id, item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Checked items */}
            {checkedItems.length > 0 && (
              <>
                <div className="pt-2 pb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Completed
                  </span>
                </div>
                <AnimatePresence>
                  {checkedItems.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="group flex items-center gap-3 p-3 rounded-xl bg-muted/30 transition-all"
                    >
                      <Checkbox
                        checked={true}
                        onCheckedChange={() => toggleItem(item.list_id, item.id, true)}
                        className="h-5 w-5 rounded-md data-[state=checked]:bg-success data-[state=checked]:border-success"
                      />
                      <span className="flex-1 font-medium line-through text-muted-foreground/60">{item.name}</span>
                      <Badge
                        variant={item.isGroup ? 'secondary' : 'outline'}
                        className="text-[10px] px-1.5 py-0 shrink-0 opacity-50"
                      >
                        {item.isGroup ? item.groupName : 'Private'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => deleteItem(item.list_id, item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Add Item</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Item name"
              className="bg-muted/50 border-0"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && newItemName.trim()) addItem(); }}
            />

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Add to</label>
              <Select value={addItemTarget} onValueChange={setAddItemTarget}>
                <SelectTrigger className="bg-muted/50 border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-primary" />
                      Personal (Private)
                    </div>
                  </SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        {group.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={addItem}
                disabled={!newItemName.trim()}
                className="flex-1 gradient-primary text-primary-foreground"
              >
                <Check className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
