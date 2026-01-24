import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, ShoppingCart, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  is_checked: boolean;
  created_at: string;
}

interface GroceryList {
  id: string;
  name: string;
  items: GroceryItem[];
}

export default function GroceryPage() {
  const { user } = useAuth();
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [addingToList, setAddingToList] = useState<string | null>(null);

  const fetchLists = async () => {
    if (!user) return;

    const { data: groceryLists } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (groceryLists) {
      // Fetch items for each list
      const listsWithItems = await Promise.all(
        groceryLists.map(async (list) => {
          const { data: items } = await supabase
            .from('grocery_items')
            .select('*')
            .eq('list_id', list.id)
            .order('created_at', { ascending: true });

          return {
            ...list,
            items: items || [],
          };
        })
      );

      setLists(listsWithItems);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchLists();
  }, [user]);

  const createDefaultList = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('grocery_lists')
      .insert({
        user_id: user.id,
        name: 'My Shopping List',
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create list');
    } else {
      setLists([{ ...data, items: [] }, ...lists]);
      toast.success('Shopping list created!');
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
      setLists((prev) =>
        prev.map((list) =>
          list.id === listId
            ? { ...list, items: [...list.items, data] }
            : list
        )
      );
      setNewItemName('');
      setAddingToList(null);
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
      setLists((prev) =>
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
      setLists((prev) =>
        prev.map((list) =>
          list.id === listId
            ? { ...list, items: list.items.filter((item) => item.id !== itemId) }
            : list
        )
      );
    }
  };

  const clearCheckedItems = async (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;

    const checkedIds = list.items.filter((item) => item.is_checked).map((item) => item.id);

    if (checkedIds.length === 0) return;

    const { error } = await supabase
      .from('grocery_items')
      .delete()
      .in('id', checkedIds);

    if (error) {
      toast.error('Failed to clear items');
    } else {
      setLists((prev) =>
        prev.map((l) =>
          l.id === listId
            ? { ...l, items: l.items.filter((item) => !item.is_checked) }
            : l
        )
      );
      toast.success('Checked items cleared!');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Grocery List</h1>
            <p className="text-muted-foreground mt-1">
              Never forget what to buy
            </p>
          </div>
          {lists.length === 0 && (
            <Button
              onClick={createDefaultList}
              className="gradient-primary text-primary-foreground shadow-glow-sm hover:shadow-glow transition-shadow"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Shopping List
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : lists.length === 0 ? (
          <Card className="border-0 shadow-md">
            <CardContent className="pt-12 pb-12 text-center">
              <ShoppingCart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold mb-2">
                No shopping lists yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Create a list to start tracking what you need to buy
              </p>
              <Button
                onClick={createDefaultList}
                className="gradient-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Shopping List
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {lists.map((list) => {
              const uncheckedCount = list.items.filter((i) => !i.is_checked).length;
              const checkedCount = list.items.filter((i) => i.is_checked).length;

              return (
                <Card key={list.id} className="border-0 shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div>
                      <CardTitle className="font-display">{list.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} remaining
                      </p>
                    </div>
                    {checkedCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearCheckedItems(list.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Clear ({checkedCount})
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Add Item */}
                    {addingToList === list.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          placeholder="Item name"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addItem(list.id);
                            if (e.key === 'Escape') {
                              setAddingToList(null);
                              setNewItemName('');
                            }
                          }}
                          autoFocus
                        />
                        <Button
                          onClick={() => addItem(list.id)}
                          size="icon"
                          className="shrink-0 gradient-primary text-primary-foreground"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full justify-start text-muted-foreground"
                        onClick={() => setAddingToList(list.id)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add item
                      </Button>
                    )}

                    {/* Items List */}
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {list.items
                        .sort((a, b) => (a.is_checked ? 1 : 0) - (b.is_checked ? 1 : 0))
                        .map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              'flex items-center gap-3 p-3 rounded-lg transition-all',
                              item.is_checked
                                ? 'bg-muted/50 opacity-60'
                                : 'bg-muted hover:bg-muted/80'
                            )}
                          >
                            <Checkbox
                              checked={item.is_checked}
                              onCheckedChange={() =>
                                toggleItem(list.id, item.id, item.is_checked)
                              }
                              className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                            />
                            <span
                              className={cn(
                                'flex-1 font-medium',
                                item.is_checked && 'line-through text-muted-foreground'
                              )}
                            >
                              {item.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteItem(list.id, item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                    </div>

                    {list.items.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p>No items yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
