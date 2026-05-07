import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { UserPlus, Check, X, Search, UserCircle2, Clock, Trash2 } from 'lucide-react';

interface ProfileLite { id: string; username: string | null; full_name: string; avatar_url: string | null; }
interface Friendship {
  id: string; requester_id: string; receiver_id: string; status: string;
  other: ProfileLite | null;
}

export default function FriendsSection() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [incoming, setIncoming] = useState<Friendship[]>([]);
  const [outgoing, setOutgoing] = useState<Friendship[]>([]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const { data: rels } = await supabase
      .from('friendships')
      .select('id, requester_id, receiver_id, status')
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
    const otherIds = (rels || []).map((r) =>
      r.requester_id === user.id ? r.receiver_id : r.requester_id
    );
    const profMap = new Map<string, ProfileLite>();
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from('profiles').select('id, username, full_name, avatar_url').in('id', otherIds);
      (profs || []).forEach((p: any) => profMap.set(p.id, p));
    }
    const enriched: Friendship[] = (rels || []).map((r) => ({
      ...r,
      other: profMap.get(r.requester_id === user.id ? r.receiver_id : r.requester_id) || null,
    }));
    setFriends(enriched.filter((r) => r.status === 'accepted'));
    setIncoming(enriched.filter((r) => r.status === 'pending' && r.receiver_id === user.id));
    setOutgoing(enriched.filter((r) => r.status === 'pending' && r.requester_id === user.id));
  }, [user]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const search = async () => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) { toast.error('Type at least 2 chars'); return; }
    setSearching(true);
    const { data, error } = await supabase.rpc('search_users_by_username', { p_query: q });
    setSearching(false);
    if (error) { toast.error('Search failed'); return; }
    setResults((data || []) as ProfileLite[]);
  };

  const sendRequest = async (receiverId: string) => {
    if (!user) return;
    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id, receiver_id: receiverId, status: 'pending',
    });
    if (error) {
      if (error.code === '23505') toast.error('Request already exists');
      else toast.error('Failed to send request');
      return;
    }
    toast.success('Friend request sent!');
    await loadAll();
  };

  const accept = async (id: string) => {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
    if (error) toast.error('Failed'); else { toast.success('Friend added!'); await loadAll(); }
  };
  const removeRel = async (id: string) => {
    const { error } = await supabase.from('friendships').delete().eq('id', id);
    if (error) toast.error('Failed'); else { toast.success('Removed'); await loadAll(); }
  };

  const isAlreadyConnected = (uid: string) =>
    friends.some((f) => f.other?.id === uid) ||
    incoming.some((f) => f.other?.id === uid) ||
    outgoing.some((f) => f.other?.id === uid);

  return (
    <div className="space-y-4">
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />Add Friend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <Input value={query}
                onChange={(e) => setQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="search by username" className="pl-7"
                onKeyDown={(e) => e.key === 'Enter' && search()} />
            </div>
            <Button onClick={search} disabled={searching} size="sm" variant="outline">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          {results.length > 0 && (
            <div className="space-y-1 border border-border rounded-lg p-1 max-h-44 overflow-y-auto">
              {results.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserCircle2 className="h-7 w-7 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">@{r.username}</p>
                    </div>
                  </div>
                  {isAlreadyConnected(r.id) ? (
                    <span className="text-[10px] text-muted-foreground">Already linked</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => sendRequest(r.id)}>
                      <UserPlus className="h-3.5 w-3.5 mr-1" />Add
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {incoming.length > 0 && (
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Friend Requests ({incoming.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCircle2 className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.other?.full_name || 'User'}</p>
                    {r.other?.username && <p className="text-[10px] text-muted-foreground">@{r.other.username}</p>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => accept(r.id)} className="bg-foreground text-background hover:bg-foreground/90">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => removeRel(r.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {outgoing.length > 0 && (
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />Pending Sent ({outgoing.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCircle2 className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.other?.full_name || 'User'}</p>
                    {r.other?.username && <p className="text-[10px] text-muted-foreground">@{r.other.username}</p>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeRel(r.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My Friends ({friends.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No friends yet</p>
          ) : friends.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                <UserCircle2 className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.other?.full_name || 'User'}</p>
                  {r.other?.username && <p className="text-[10px] text-muted-foreground">@{r.other.username}</p>}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeRel(r.id)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
