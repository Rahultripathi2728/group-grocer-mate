import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Check, Sparkles, User, Users, ClipboardList, Wifi } from 'lucide-react';
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
  items: ListItem[];
}

interface Group {
  id: string;
  name: string;
}

export default function ListPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'personal' | 'group'>('personal');
  const [personalList, setPersonalList] = useState<GroceryList | null>(null);
  const [groupLists, setGroupLists] = useState<GroceryList[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, Profile>>({});

  const fetchData = async () => {
    if (!user) return;

    // Fetch personal list (no group_id)
    const { data: personalLists } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('user_id', user.id)
      .is('group_id', null)
      .limit(1);

    if (personalLists && personalLists.length > 0) {
      const { data: items } = await supabase
        .from('grocery_items')
        .select('*')
        .eq('list_id', personalLists[0].id)
        .order('created_at', { ascending: true });

      setPersonalList({
        ...personalLists[0],
        items: items || [],
      });
    }

    // Fetch user's groups
    const { data: ownedGroups } = await supabase
      .from('groups')
      .select('id, name')
      .eq('owner_id', user.id);

    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('group_id, groups(id, name)')
      .eq('user_id', user.id);

    const memberGroups = memberships?.map((m) => m.groups).filter(Boolean) || [];

    const allGroups = [
      ...(ownedGroups || []),
      ...memberGroups.map((g: any) => g),
    ];

    const uniqueGroups = allGroups.filter(
      (group, index, self) => index === self.findIndex((g) => g.id === group.id)
    );

    setGroups(uniqueGroups);

    if (uniqueGroups.length > 0) {
      const firstGroupId = uniqueGroups[0].id;
      setSelectedGroupId(firstGroupId);
      await fetchGroupList(firstGroupId);
    }

    setLoading(false);
  };

  const fetchGroupList = async (groupId: string) => {
    // Fetch or create group list
    let { data: lists } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('group_id', groupId)
      .limit(1);

    if (lists && lists.length > 0) {
      const { data: items } = await supabase
        .from('grocery_items')
        .select('*')
        .eq('list_id', lists[0].id)
        .order('created_at', { ascending: true });

      setGroupLists([{
        ...lists[0],
        items: items || [],
      }]);
      
      // Fetch member profiles for avatars
      await fetchGroupMembers(groupId);
    } else {
      setGroupLists([]);
    }
  };

  const fetchGroupMembers = async (groupId: string) => {
    // Fetch group owner
    const { data: group } = await supabase
      .from('groups')
      .select('owner_id, profiles(id, full_name)')
      .eq('id', groupId)
      .single();

    // Fetch group members
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('user_id, profiles(id, full_name)')
      .eq('group_id', groupId);

    const profiles: Record<string, Profile> = {};
    
    if (group?.profiles) {
      const ownerProfile = group.profiles as unknown as Profile;
      profiles[group.owner_id] = ownerProfile;
    }
    
    memberships?.forEach((m: any) => {
      if (m.profiles) {
        profiles[m.user_id] = m.profiles;
      }
    });

    setMemberProfiles(profiles);
  };

  // Handle real-time updates for group list items
  const handleRealtimeUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    setGroupLists((prevLists) => {
      return prevLists.map((list) => {
        // Only update if this event is for the current group list
        if (eventType === 'INSERT' && newRecord.list_id === list.id) {
          // Check if item already exists (to prevent duplicates from own actions)
          const exists = list.items.some(item => item.id === newRecord.id);
          if (exists) return list;
          
          return {
            ...list,
            items: [...list.items, newRecord as ListItem],
          };
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
          return {
            ...list,
            items: list.items.filter((item) => item.id !== oldRecord.id),
          };
        }
        
        return list;
      });
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    if (selectedGroupId) {
      fetchGroupList(selectedGroupId);
    }
  }, [selectedGroupId]);

  // Set up real-time subscription for group list
  useEffect(() => {
    if (!groupLists[0]?.id) return;

    const listId = groupLists[0].id;
    
    const channel = supabase
      .channel(`grocery-items-${listId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'grocery_items',
          filter: `list_id=eq.${listId}`,
        },
        handleRealtimeUpdate
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
      setIsRealtimeConnected(false);
    };
  }, [groupLists[0]?.id, handleRealtimeUpdate]);

  const createPersonalList = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('grocery_lists')
      .insert({
        user_id: user.id,
        name: 'My Personal List',
        group_id: null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create list');
    } else {
      setPersonalList({ ...data, items: [] });
      toast.success('Personal list created!');
    }
  };

  const createGroupList = async () => {
    if (!user || !selectedGroupId) return;

    const group = groups.find(g => g.id === selectedGroupId);
    
    const { data, error } = await supabase
      .from('grocery_lists')
      .insert({
        user_id: user.id,
        name: `${group?.name || 'Group'} List`,
        group_id: selectedGroupId,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create group list');
    } else {
      setGroupLists([{ ...data, items: [] }]);
      toast.success('Group list created!');
    }
  };

  const addItem = async (listId: string, isGroup: boolean) => {
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
      if (isGroup) {
        setGroupLists((prev) =>
          prev.map((list) =>
            list.id === listId ? { ...list, items: [...list.items, data] } : list
          )
        );
      } else {
        setPersonalList((prev) =>
          prev ? { ...prev, items: [...prev.items, data] } : prev
        );
      }
      setNewItemName('');
      setIsAdding(false);
    }
  };

  const toggleItem = async (listId: string, itemId: string, isChecked: boolean, isGroup: boolean) => {
    const { error } = await supabase
      .from('grocery_items')
      .update({ is_checked: !isChecked })
      .eq('id', itemId);

    if (error) {
      toast.error('Failed to update item');
    } else {
      const updateList = (list: GroceryList) => ({
        ...list,
        items: list.items.map((item) =>
          item.id === itemId ? { ...item, is_checked: !isChecked } : item
        ),
      });

      if (isGroup) {
        setGroupLists((prev) =>
          prev.map((list) => (list.id === listId ? updateList(list) : list))
        );
      } else {
        setPersonalList((prev) => (prev ? updateList(prev) : prev));
      }
    }
  };

  const deleteItem = async (listId: string, itemId: string, isGroup: boolean) => {
    const { error } = await supabase.from('grocery_items').delete().eq('id', itemId);

    if (error) {
      toast.error('Failed to delete item');
    } else {
      if (isGroup) {
        setGroupLists((prev) =>
          prev.map((list) =>
            list.id === listId
              ? { ...list, items: list.items.filter((item) => item.id !== itemId) }
              : list
          )
        );
      } else {
        setPersonalList((prev) =>
          prev
            ? { ...prev, items: prev.items.filter((item) => item.id !== itemId) }
            : prev
        );
      }
    }
  };

  const clearCheckedItems = async (listId: string, isGroup: boolean) => {
    const list = isGroup 
      ? groupLists.find((l) => l.id === listId) 
      : personalList;
    
    if (!list) return;

    const checkedIds = list.items.filter((item) => item.is_checked).map((item) => item.id);

    if (checkedIds.length === 0) return;

    const { error } = await supabase.from('grocery_items').delete().in('id', checkedIds);

    if (error) {
      toast.error('Failed to clear items');
    } else {
      const updateList = (l: GroceryList) => ({
        ...l,
        items: l.items.filter((item) => !item.is_checked),
      });

      if (isGroup) {
        setGroupLists((prev) =>
          prev.map((l) => (l.id === listId ? updateList(l) : l))
        );
      } else {
        setPersonalList((prev) => (prev ? updateList(prev) : prev));
      }
      toast.success('Checked items cleared!');
    }
  };

  const renderListContent = (list: GroceryList | null, isGroup: boolean) => {
    if (!list) {
      return (
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
            <h3 className="text-xl font-display font-semibold mb-2">
              {isGroup ? 'No group list yet' : 'No personal list yet'}
            </h3>
            <p className="text-muted-foreground mb-6">
              {isGroup 
                ? 'Create a shared list for your group members'
                : 'Create a list for your personal items'
              }
            </p>
            <Button
              onClick={isGroup ? createGroupList : createPersonalList}
              className="gradient-primary text-primary-foreground"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create {isGroup ? 'Group' : 'Personal'} List
            </Button>
          </CardContent>
        </Card>
      );
    }

    const uncheckedCount = list.items.filter((i) => !i.is_checked).length;
    const checkedCount = list.items.filter((i) => i.is_checked).length;

    return (
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-xl", isGroup ? "bg-accent" : "bg-primary/10")}>
              {isGroup ? (
                <Users className="h-5 w-5 text-accent-foreground" />
              ) : (
                <User className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="font-display">{list.name}</CardTitle>
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
              <p className="text-sm text-muted-foreground mt-0.5">
                {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} remaining
                {isGroup && ' • Synced with group'}
              </p>
            </div>
          </div>
          {checkedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearCheckedItems(list.id, isGroup)}
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
            {isAdding ? (
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
                    if (e.key === 'Enter') addItem(list.id, isGroup);
                    if (e.key === 'Escape') {
                      setIsAdding(false);
                      setNewItemName('');
                    }
                  }}
                  autoFocus
                  className="bg-muted/50 border-0"
                />
                <Button
                  onClick={() => addItem(list.id, isGroup)}
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
                  onClick={() => setIsAdding(true)}
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
                        onCheckedChange={() => toggleItem(list.id, item.id, item.is_checked, isGroup)}
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
                        onClick={() => deleteItem(list.id, item.id, isGroup)}
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
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'personal' | 'group')}>
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger 
              value="personal" 
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <User className="h-4 w-4" />
              Personal
            </TabsTrigger>
            <TabsTrigger 
              value="group" 
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              Group
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-6">
            {loading ? (
              <div className="h-48 bg-muted/50 rounded-2xl animate-pulse" />
            ) : (
              renderListContent(personalList, false)
            )}
          </TabsContent>

          <TabsContent value="group" className="mt-6 space-y-4">
            {groups.length > 0 && (
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger className="w-full bg-muted/50 border-0">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
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
            )}

            {loading ? (
              <div className="h-48 bg-muted/50 rounded-2xl animate-pulse" />
            ) : groups.length === 0 ? (
              <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
                <CardContent className="pt-12 pb-12 text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex p-6 rounded-full bg-primary/10 mb-6"
                  >
                    <Users className="h-10 w-10 text-primary" />
                  </motion.div>
                  <p className="text-muted-foreground mb-2">No groups found</p>
                  <p className="text-sm text-muted-foreground">
                    Create or join a group to use shared lists
                  </p>
                </CardContent>
              </Card>
            ) : (
              renderListContent(groupLists[0] || null, true)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
