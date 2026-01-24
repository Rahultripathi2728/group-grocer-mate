import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Plus,
  Users,
  Copy,
  MoreVertical,
  LogOut,
  Trash2,
  Crown,
  UserPlus,
} from 'lucide-react';
import { format } from 'date-fns';

interface Group {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
  member_count?: number;
  is_owner?: boolean;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    full_name: string;
    email: string;
  };
}

export default function GroupsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const fetchGroups = async () => {
    if (!user) return;

    // Get groups where user is owner
    const { data: ownedGroups } = await supabase
      .from('groups')
      .select('*')
      .eq('owner_id', user.id);

    // Get groups where user is member
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('group_id, groups(*)')
      .eq('user_id', user.id);

    const memberGroups = memberships?.map((m) => m.groups).filter(Boolean) || [];
    
    const allGroups = [
      ...(ownedGroups || []).map((g) => ({ ...g, is_owner: true })),
      ...memberGroups.map((g: any) => ({ ...g, is_owner: false })),
    ];

    // Remove duplicates
    const uniqueGroups = allGroups.filter(
      (group, index, self) => index === self.findIndex((g) => g.id === group.id)
    );

    setGroups(uniqueGroups);
    setLoading(false);
  };

  const fetchMembers = async (groupId: string) => {
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('*, profiles(full_name, email)')
      .eq('group_id', groupId);

    const { data: group } = await supabase
      .from('groups')
      .select('owner_id, profiles(full_name, email)')
      .eq('id', groupId)
      .single();

    const memberList: Member[] = (memberships || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      profile: m.profiles,
    }));

    // Add owner to list
    if (group) {
      memberList.unshift({
        id: 'owner',
        user_id: group.owner_id,
        role: 'owner',
        joined_at: '',
        profile: group.profiles as any,
      });
    }

    setMembers(memberList);
  };

  useEffect(() => {
    fetchGroups();
  }, [user]);

  useEffect(() => {
    if (selectedGroup) {
      fetchMembers(selectedGroup.id);
    }
  }, [selectedGroup]);

  const handleCreateGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    const { error } = await supabase.from('groups').insert({
      name: name.trim(),
      description: description.trim() || null,
      owner_id: user.id,
    });

    if (error) {
      toast.error('Failed to create group');
    } else {
      toast.success('Group created!');
      setCreateDialogOpen(false);
      fetchGroups();
    }
  };

  const handleJoinGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const inviteCode = (formData.get('inviteCode') as string).trim();

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (!group || groupError) {
      toast.error('Invalid invite code');
      return;
    }

    const { error } = await supabase.from('group_memberships').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'member',
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('You are already a member of this group');
      } else {
        toast.error('Failed to join group');
      }
    } else {
      toast.success('Joined group successfully!');
      setJoinDialogOpen(false);
      fetchGroups();
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('group_memberships')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id);

    if (error) {
      toast.error('Failed to leave group');
    } else {
      toast.success('Left group');
      setSelectedGroup(null);
      fetchGroups();
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const { error } = await supabase.from('groups').delete().eq('id', groupId);

    if (error) {
      toast.error('Failed to delete group');
    } else {
      toast.success('Group deleted');
      setSelectedGroup(null);
      fetchGroups();
    }
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Invite code copied!');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Groups</h1>
            <p className="text-muted-foreground mt-1">
              Manage shared expenses with friends and family
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Join Group
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">Join a Group</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleJoinGroup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="inviteCode">Invite Code</Label>
                    <Input
                      id="inviteCode"
                      name="inviteCode"
                      placeholder="Enter invite code"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full gradient-primary text-primary-foreground">
                    Join Group
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground shadow-glow-sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">Create New Group</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateGroup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Group Name</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="e.g., Roommates"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      name="description"
                      placeholder="What is this group for?"
                    />
                  </div>
                  <Button type="submit" className="w-full gradient-primary text-primary-foreground">
                    Create Group
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Groups List */}
          <div className="lg:col-span-1 space-y-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <Card className="border-0 shadow-md">
                <CardContent className="pt-8 pb-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">No groups yet</p>
                  <Button
                    onClick={() => setCreateDialogOpen(true)}
                    variant="link"
                    className="text-primary"
                  >
                    Create your first group
                  </Button>
                </CardContent>
              </Card>
            ) : (
              groups.map((group) => (
                <Card
                  key={group.id}
                  className={`border-0 shadow-md cursor-pointer transition-all hover:shadow-lg ${
                    selectedGroup?.id === group.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedGroup(group)}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{group.name}</h3>
                            {group.is_owner && (
                              <Crown className="h-3 w-3 text-warning" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {group.description || 'No description'}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              copyInviteCode(group.invite_code);
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Invite Code
                          </DropdownMenuItem>
                          {group.is_owner ? (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteGroup(group.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Group
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLeaveGroup(group.id);
                              }}
                            >
                              <LogOut className="h-4 w-4 mr-2" />
                              Leave Group
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Group Details */}
          <Card className="lg:col-span-2 border-0 shadow-md">
            {selectedGroup ? (
              <>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-display flex items-center gap-2">
                        {selectedGroup.name}
                        {selectedGroup.is_owner && (
                          <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full">
                            Admin
                          </span>
                        )}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Created {format(new Date(selectedGroup.created_at), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg">
                      <span className="text-sm text-muted-foreground">Invite:</span>
                      <code className="text-sm font-mono">{selectedGroup.invite_code}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyInviteCode(selectedGroup.invite_code)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <h4 className="font-semibold mb-4">Members ({members.length})</h4>
                  <div className="space-y-3">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-semibold text-primary">
                              {member.profile?.full_name?.[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">
                              {member.profile?.full_name || 'Unknown'}
                              {member.user_id === user?.id && (
                                <span className="text-muted-foreground ml-1">(You)</span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {member.profile?.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {member.role === 'owner' && (
                            <span className="text-xs bg-warning/20 text-warning px-2 py-1 rounded-full flex items-center gap-1">
                              <Crown className="h-3 w-3" />
                              Owner
                            </span>
                          )}
                          {member.role === 'admin' && (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
                              Admin
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Select a group to view details</p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
