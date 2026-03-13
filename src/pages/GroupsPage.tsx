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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Group {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
  is_owner?: boolean;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    full_name: string;
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
  
  // Confirmation states
  const [createConfirm, setCreateConfirm] = useState<{ name: string; description: string } | null>(null);
  const [joinConfirm, setJoinConfirm] = useState<{ inviteCode: string; groupId: string } | null>(null);

  const fetchGroups = async () => {
    if (!user) return;

    const { data: ownedGroups } = await supabase
      .from('groups')
      .select('*')
      .eq('owner_id', user.id);

    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('group_id, groups(*)')
      .eq('user_id', user.id);

    const memberGroups = memberships?.map((m) => m.groups).filter(Boolean) || [];

    const allGroups = [
      ...(ownedGroups || []).map((g) => ({ ...g, is_owner: true })),
      ...memberGroups.map((g: any) => ({ ...g, is_owner: false })),
    ];

    const uniqueGroups = allGroups.filter(
      (group, index, self) => index === self.findIndex((g) => g.id === group.id)
    );

    setGroups(uniqueGroups);
    setLoading(false);
  };

  const fetchMembers = async (groupId: string) => {
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('*, profiles(full_name)')
      .eq('group_id', groupId);

    const { data: group } = await supabase
      .from('groups')
      .select('owner_id, profiles(full_name)')
      .eq('id', groupId)
      .single();

    const memberList: Member[] = (memberships || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      profile: m.profiles,
    }));

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
    const name = (formData.get('name') as string || '').trim().slice(0, 100);
    const description = (formData.get('description') as string || '').trim().slice(0, 500);

    if (!name || name.length === 0) {
      toast.error('Group name is required');
      return;
    }

    setCreateConfirm({ name, description });
  };

  const confirmCreateGroup = async () => {
    if (!user || !createConfirm) return;

    const { error } = await supabase.from('groups').insert({
      name: createConfirm.name,
      description: createConfirm.description || null,
      owner_id: user.id,
    });

    if (error) {
      toast.error('Failed to create group');
    } else {
      toast.success('Group created!');
      setCreateDialogOpen(false);
      fetchGroups();
    }
    setCreateConfirm(null);
  };

  const handleJoinGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const inviteCode = (formData.get('inviteCode') as string || '').trim().slice(0, 50);

    if (!inviteCode || !/^[a-f0-9]+$/i.test(inviteCode)) {
      toast.error('Invalid invite code format');
      return;
    }

    const { data: groupId, error: groupError } = await supabase
      .rpc('get_group_id_by_invite_code', { p_invite_code: inviteCode });

    if (!groupId || groupError) {
      toast.error('Invalid invite code');
      return;
    }

    setJoinConfirm({ inviteCode, groupId });
  };

  const confirmJoinGroup = async () => {
    if (!user || !joinConfirm) return;

    const { error } = await supabase.from('group_memberships').insert({
      group_id: joinConfirm.groupId,
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
    setJoinConfirm(null);
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

  // Delete group confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDeleteGroup = async (groupId: string) => {
    setDeleteConfirm(groupId);
  };

  const confirmDeleteGroup = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase.from('groups').delete().eq('id', deleteConfirm);

    if (error) {
      toast.error('Failed to delete group');
    } else {
      toast.success('Group deleted');
      setSelectedGroup(null);
      fetchGroups();
    }
    setDeleteConfirm(null);
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
                <Button variant="outline" className="border-border hover:bg-muted">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Join Group
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
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
                      className="font-mono"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground"
                  >
                    Join Group
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-foreground text-background hover:bg-foreground/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display">Create New Group</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateGroup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Group Name</Label>
                    <Input id="name" name="name" placeholder="e.g., Roommates" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      name="description"
                      placeholder="What is this group for?"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground"
                  >
                    Create Group
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Groups List */}
          <div className="lg:col-span-1 space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-muted/50 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <Card className="border border-border shadow-sm">
                <CardContent className="pt-12 pb-12 text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex p-6 rounded-full bg-primary/10 mb-6"
                  >
                    <Users className="h-10 w-10 text-primary" />
                  </motion.div>
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
              <AnimatePresence>
                {groups.map((group, i) => (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card
                      className={cn(
                        'border border-border shadow-sm cursor-pointer transition-all duration-300 hover:shadow-md',
                        selectedGroup?.id === group.id && 'ring-2 ring-primary'
                      )}
                      onClick={() => setSelectedGroup(group)}
                    >
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{group.name}</h3>
                                {group.is_owner && (
                                  <Crown className="h-3.5 w-3.5 text-warning" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {group.description || 'No description'}
                              </p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="rounded-xl">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                              {group.is_owner && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyInviteCode(group.invite_code);
                                  }}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Invite Code
                                </DropdownMenuItem>
                              )}
                              {group.is_owner ? (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
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
                                  className="text-destructive focus:text-destructive"
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
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Group Details */}
          <Card className="lg:col-span-2 border border-border shadow-sm min-h-[400px]">
            <AnimatePresence mode="wait">
              {selectedGroup ? (
                <motion.div
                  key={selectedGroup.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <CardHeader className="border-b border-border">
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
                      {selectedGroup.is_owner && (
                        <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-xl">
                          <span className="text-sm text-muted-foreground">Invite:</span>
                          <code className="text-sm font-mono font-semibold">
                            {selectedGroup.invite_code}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            onClick={() => copyInviteCode(selectedGroup.invite_code)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Members ({members.length})
                    </h4>
                    <div className="space-y-3">
                      {members.map((member, i) => (
                        <motion.div
                          key={member.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-bold text-primary">
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
                              <p className="text-sm text-muted-foreground capitalize">
                                {member.role}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {member.role === 'owner' && (
                              <span className="text-xs bg-warning/20 text-warning px-2.5 py-1 rounded-full flex items-center gap-1">
                                <Crown className="h-3 w-3" />
                                Owner
                              </span>
                            )}
                            {member.role === 'admin' && (
                              <span className="text-xs bg-primary/20 text-primary px-2.5 py-1 rounded-full">
                                Admin
                              </span>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full py-20"
                >
                  <div className="inline-flex p-4 rounded-full bg-muted/50 mb-4">
                    <Sparkles className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-center">
                    Select a group to view details
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      </div>

      {/* Create Group Confirmation */}
      <AlertDialog open={!!createConfirm} onOpenChange={(open) => !open && setCreateConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Group?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to create a new group <strong>"{createConfirm?.name}"</strong>. You will be the admin of this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCreateGroup} className="bg-primary text-primary-foreground">
              Create Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Join Group Confirmation */}
      <AlertDialog open={!!joinConfirm} onOpenChange={(open) => !open && setJoinConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Join Group?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to join a group with invite code <strong>{joinConfirm?.inviteCode}</strong>. Other members will be able to see your name and shared expenses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmJoinGroup} className="bg-primary text-primary-foreground">
              Join Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Group Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group?</AlertDialogTitle>
            <AlertDialogDescription>
              Kya aap sure hain? Is group ke saare expenses, splits aur data permanently delete ho jayenge. Yeh action undo nahi hoga.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
