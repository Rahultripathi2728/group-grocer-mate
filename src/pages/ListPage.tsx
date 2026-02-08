import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Check, Sparkles, User, Users, ClipboardList, Wifi, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface Profile {
  id: string;
  full_name: string;
}

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

interface Group {
  id: string;
  name: string;
}

export default function ListPage() {
  const { user } = useAuth();
  const [allLists, setAllLists] = useState<GroceryList[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, Profile>>({});
  
  // New list dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newListType, setNewListType] = useState<'personal' | 'group'>('personal');
  const [newListGroupId, setNewListGroupId] = useState('');
  const [newListName, setNewListName] = useState('');

  const fetchData = async () => {
    if (!user) return;

    // Fetch all lists (personal + group) in parallel
    const [personalResult, groupListsResult, ownedGroupsResult, membershipsResult] = await Promise.all([
      supabase
        .from('grocery_lists')
        .select('*')
        .eq('user_id', user.id)
        .is('group_id', null),
      supabase
        .from('grocery_lists')
        .select('*, groups(name)')
        .not('group_id', 'is', null),
      supabase
        .from('groups')
        .select('id, name')
        .eq('owner_id', user.id),
      supabase
        .from('group_memberships')
        .select('group_id, groups(id, name)')
        .eq('user_id', user.id),
    ]);

    // Build groups list
    const memberGroups = membershipsResult.data?.map((m) => m.groups).filter(Boolean) || [];
    const allGroups = [
      ...(ownedGroupsResult.data || []),
      ...memberGroups.map((g: any) => g),
    ];
    const uniqueGroups = allGroups.filter(
      (group, index, self) => index === self.findIndex((g) => g.id === group.id)
    );
    setGroups(uniqueGroups);

    // Build all lists with items
    const lists: GroceryList[] = [];

    // Personal lists
    for (const list of personalResult.data || []) {
      const { data: items } = await supabase
        .from('grocery_items')
        .select('*')
        .eq('list_id', list.id)
        .order('created_at', { ascending: true });

      lists.push({
        ...list,
        group_name: undefined,
        items: items || [],
      });
    }

    // Group lists
    for (const list of groupListsResult.data || []) {
      const { data: items } = await supabase
        .from('grocery_items')
        .select('*')
        .eq('list_id', list.id)
        .order('created_at', { ascending: true });

      lists.push({
        ...list,
        group_name: (list.groups as any)?.name || 'Group',
        items: items || [],
      });

      // Fetch member profiles for group lists
      if (list.group_id) {
        await fetchGroupMembers(list.group_id);
      }
    }

    setAllLists(lists);
    setLoading(false);
  };

  const fetchGroupMembers = async (groupId: string) => {
    const [groupResult, membershipsResult] = await Promise.all([
      supabase.from('groups').select('owner_id, profiles(id, full_name)').eq('id', groupId).single(),
      supabase.from('group_memberships').select('user_id, profiles(id, full_name)').eq('group_id', groupId),
    ]);

    const profiles: Record<string, Profile> = { ...memberProfiles };

    if (groupResult.data?.profiles) {
      const ownerProfile = groupResult.data.profiles as unknown as Profile;
      profiles[groupResult.data.owner_id] = ownerProfile;
    }

    membershipsResult.data?.forEach((m: any) => {
      if (m.profiles) {
        profiles[m.user_id] = m.profiles;
      }
    });

    setMemberProfiles(profiles);
  };

  // Handle real-time updates for group list items
  const handleRealtimeUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    setAllLists((prevLists) => {
      return prevLists.map((list) => {
        if (eventType === 'INSERT' && newRecord.list_id === list.id) {
          const exists = list.items.some(item => item.id === newRecord.id);
          if (exists) return list;
          return { ...list, items: [...list.items, newRecord as ListItem] };
        }
        if (eventType === 'UPDATE' && newRecord.list_id === list.id) {
          return {
            ...list,
            items: list.items.map((item) =>
              item.id === newRecord.id ? (newRecord as ListItem) : item
            ),
          };
        }
        if (eventType === 'DELETE' && oldRecord.list_id === list.id) {
          return { ...list, items: list.items.filter((item) => item.id !== oldRecord.id) };
        }
        return list;
      });
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [user]);

  // Set up real-time subscriptions for all group lists
  useEffect(() => {
    const groupLists = allLists.filter(l => l.group_id);
    if (groupLists.length === 0) return;

    const channels = groupLists.map(list => {
      return supabase
        .channel(`grocery-items-${list.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'grocery_items',
            filter: `list_id=eq.${list.id}`,
          },
          handleRealtimeUpdate
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setIsRealtimeConnected(true);
        });
    });

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
      setIsRealtimeConnected(false);
    };
  }, [allLists.map(l => l.id).join(','), handleRealtimeUpdate]);

  const createNewList = async () => {
    if (!user) return;

    const listName = newListName.trim() || (newListType === 'personal' ? 'My Personal List' : 'Group List');
    const groupId = newListType === 'group' && newListGroupId ? newListGroupId : null;

    if (newListType === 'group' && !newListGroupId) {
      toast.error('Please select a group');
      return;
    }

    const { data, error } = await supabase
      .from('grocery_lists')
      .insert({
        user_id: user.id,
        name: listName,
        group_id: groupId,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create list');
    } else {
      const group = groups.find(g => g.id === groupId);
      setAllLists(prev => [...prev, {
        ...data,
        group_name: group?.name,
        items: [],
      }]);
      toast.success('List created!');
      setCreateDialogOpen(false);
      setNewListName('');
      setNewListType('personal');
      setNewListGroupId('');
    }
  };

  const addItem = async (listId: string) => {
    if (!user || !newItemName.trim()) return;

    const { data, error } = await supabase
      .from('grocery_items')
      .insert({
        list_id: listId,
        name: newItemName.trim(),
        quantity: 1,
        added_by: user.id,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add item');
    } else {
      setAllLists((prev) =>
        prev.map((list) =>
          list.id === listId ? { ...list, items: [...list.items, data] } : list
        )
      );
      setNewItemName('');
      setAddingToListId(null);
    }
  };

  const toggleItem = async (listId: string, itemId: string, isChecked: boolean) => {
    const { error } = await supabase
      .from('grocery_items')
      .update({ is_checked: !isChecked })
      .eq('id', itemId);

    if (error) {
      toast.error('Failed to update item');
    } else {
      setAllLists((prev) =>
        prev.map((list) =>
          list.id === listId
            ? {
                ...list,
                items: list.items.map((item) =>
                  item.id === itemId ? { ...item, is_checked: !isChecked } : item
                ),
              }
            : list
        )
      );
    }
  };

  const deleteItem = async (listId: string, itemId: string) => {
    const { error } = await supabase.from('grocery_items').delete().eq('id', itemId);
    if (error) {
      toast.error('Failed to delete item');
    } else {
      setAllLists((prev) =>
        prev.map((list) =>
          list.id === listId
            ? { ...list, items: list.items.filter((item) => item.id !== itemId) }
            : list
        )
      );
    }
  };

  const clearCheckedItems = async (listId: string) => {
    const list = allLists.find((l) => l.id === listId);
    if (!list) return;
    const checkedIds = list.items.filter((item) => item.is_checked).map((item) => item.id);
    if (checkedIds.length === 0) return;

    const { error } = await supabase.from('grocery_items').delete().in('id', checkedIds);
    if (error) {
      toast.error('Failed to clear items');
    } else {
      setAllLists((prev) =>
        prev.map((l) =>
          l.id === listId ? { ...l, items: l.items.filter((item) => !item.is_checked) } : l
        )
      );
      toast.success('Checked items cleared!');
    }
  };

  const renderListCard = (list: GroceryList) => {
    const isGroup = !!list.group_id;
    const uncheckedCount = list.items.filter((i) => !i.is_checked).length;
    const checkedCount = list.items.filter((i) => i.is_checked).length;

    return (
      <motion.div
        key={list.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
      >
        <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-xl", isGroup ? "bg-accent" : "bg-primary/10")}>
                {isGroup ? (
                  <Users className="h-5 w-5 text-accent-foreground" />
                ) : (
                  <Lock className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="font-display text-base">{list.name}</CardTitle>
                  {isGroup && isRealtimeConnected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium"
                    >
                      <Wifi className="h-3 w-3" />
                      <span>Live</span>
                    </motion.div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant={isGroup ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                    {isGroup ? list.group_name : 'Private'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} remaining
                  </span>
                </div>
              </div>
            </div>
            {checkedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearCheckedItems(list.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear ({checkedCount})
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {/* Add Item */}
            <AnimatePresence mode="wait">
              {addingToListId === list.id ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-2"
                >
                  <Input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Item name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addItem(list.id);
                      if (e.key === 'Escape') {
                        setAddingToListId(null);
                        setNewItemName('');
                      }
                    }}
                    autoFocus
                    className="bg-muted/50 border-0"
                  />
                  <Button
                    onClick={() => addItem(list.id)}
                    size="icon"
                    className="shrink-0 gradient-primary text-primary-foreground rounded-xl"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-muted-foreground border-dashed border-2 hover:border-primary/50 hover:bg-primary/5"
                    onClick={() => {
                      setAddingToListId(list.id);
                      setNewItemName('');
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add item
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Items List */}
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              <AnimatePresence>
                {list.items
                  .sort((a, b) => (a.is_checked ? 1 : 0) - (b.is_checked ? 1 : 0))
                  .map((item) => {
                    const addedByProfile = item.added_by ? memberProfiles[item.added_by] : null;
                    const isCurrentUser = item.added_by === user?.id;

                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className={cn(
                          'group flex items-center gap-3 p-3 rounded-xl transition-all duration-200',
                          item.is_checked ? 'bg-muted/30' : 'bg-muted/50 hover:bg-muted'
                        )}
                      >
                        <Checkbox
                          checked={item.is_checked}
                          onCheckedChange={() => toggleItem(list.id, item.id, item.is_checked)}
                          className="h-5 w-5 rounded-md data-[state=checked]:bg-success data-[state=checked]:border-success"
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              'font-medium transition-all duration-200 block',
                              item.is_checked && 'line-through text-muted-foreground/60'
                            )}
                          >
                            {item.name}
                          </span>
                          {isGroup && addedByProfile && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Avatar className="h-4 w-4">
                                <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                                  {addedByProfile.full_name?.[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">
                                {isCurrentUser ? 'You' : addedByProfile.full_name}
                              </span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => deleteItem(list.id, item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
            </div>

            {list.items.length === 0 && (
              <div className="text-center py-8">
                <Sparkles className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-muted-foreground">No items yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

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
              Personal & shared shopping lists
            </motion.p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            size="icon"
            className="gradient-primary text-primary-foreground rounded-full h-12 w-12 shadow-glow"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* All Lists */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-muted/50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : allLists.length === 0 ? (
          <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
            <CardContent className="pt-16 pb-16 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.4 }}
                className="inline-flex p-6 rounded-full bg-primary/10 mb-6"
              >
                <ClipboardList className="h-12 w-12 text-primary" />
              </motion.div>
              <h3 className="text-xl font-display font-semibold mb-2">No lists yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first list to start tracking items
              </p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="gradient-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create a List
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {allLists.map(renderListCard)}
          </div>
        )}
      </div>

      {/* Create List Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Create New List</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* List Type Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewListType('personal')}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all',
                  newListType === 'personal'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <Lock className="h-4 w-4" />
                <span className="font-medium">Personal</span>
              </button>
              <button
                type="button"
                onClick={() => setNewListType('group')}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all',
                  newListType === 'group'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <Users className="h-4 w-4" />
                <span className="font-medium">Group</span>
              </button>
            </div>

            {/* Group Selection */}
            {newListType === 'group' && (
              <Select value={newListGroupId} onValueChange={setNewListGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No groups available
                    </SelectItem>
                  ) : (
                    groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          {group.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}

            {/* List Name */}
            <Input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder={newListType === 'personal' ? 'My Shopping List' : 'Group Shopping List'}
              className="bg-muted/50 border-0"
            />

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={createNewList}
                disabled={newListType === 'group' && !newListGroupId}
                className="flex-1 gradient-primary text-primary-foreground"
              >
                Create List
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
