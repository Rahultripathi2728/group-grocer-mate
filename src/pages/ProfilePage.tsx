import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  User, Mail, Lock, Save, LogOut, Download, Bell, CheckCircle2,
  Smartphone, Share, ArrowRight, Eye, EyeOff
} from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [upiId, setUpiId] = useState('');
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Install PWA state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.user_metadata?.full_name || '');
      setEmail(user.email || '');
      // Fetch UPI ID from profiles
      supabase.from('profiles').select('upi_id').eq('id', user.id).single().then(({ data }) => {
        if (data?.upi_id) setUpiId(data.upi_id);
      });
    }
  }, [user]);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const userInitials = fullName
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || email?.[0]?.toUpperCase() || 'U';

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Update auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      });
      if (authError) throw authError;

      // Update profiles table
      await supabase.from('profiles').update({
        full_name: fullName,
        upi_id: upiId || null,
      } as any).eq('id', user.id);

      toast({ title: 'Profile updated! ✅' });
    } catch (err: any) {
      toast({ title: 'Error updating profile', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password changed successfully! 🔒' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({ title: 'Error changing password', description: err.message, variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      toast({ title: 'App installed! 🎉' });
    }
    setDeferredPrompt(null);
  };

  const handleTogglePush = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast({ title: 'Notifications turned off' });
    } else {
      const success = await subscribe();
      if (success) toast({ title: 'Notifications enabled! 🔔' });
      else toast({ title: 'Could not enable notifications', variant: 'destructive' });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-5">
        {/* Profile Header */}
        <div className="flex flex-col items-center gap-3 py-4">
          <Avatar className="h-20 w-20 shadow-lg">
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{fullName || 'User'}</h1>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>

        {/* Edit Profile */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Profile Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-xs">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upiId" className="text-xs">UPI ID</Label>
              <Input
                id="upiId"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. yourname@upi"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{email}</span>
              </div>
            </div>
            <Button onClick={handleSaveProfile} disabled={saving} size="sm" className="w-full">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-xs">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-xs">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Password confirm karein"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword || !confirmPassword}
              size="sm"
              variant="outline"
              className="w-full"
            >
              <Lock className="h-4 w-4 mr-2" />
              {changingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </CardContent>
        </Card>

        {/* Install & Notifications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              App & Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Install Banner */}
            {!isInstalled ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-3">
                  <Download className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Install App</p>
                    <p className="text-xs text-muted-foreground">Home screen par add karein</p>
                  </div>
                </div>
                {deferredPrompt ? (
                  <Button size="sm" variant="outline" onClick={handleInstall}>
                    Install
                  </Button>
                ) : isIOS ? (
                  <Button size="sm" variant="ghost" onClick={() => navigate('/install')}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => navigate('/install')}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-primary text-sm p-3 rounded-lg bg-primary/5">
                <CheckCircle2 className="h-4 w-4" />
                App installed hai!
              </div>
            )}

            {/* Push Notifications Toggle */}
            {isSupported && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Push Notifications</p>
                    <p className="text-xs text-muted-foreground">
                      {isSubscribed ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant={isSubscribed ? 'outline' : 'default'} onClick={handleTogglePush}>
                  {isSubscribed ? 'Off' : 'Enable'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Sign Out */}
        <Button onClick={handleSignOut} variant="destructive" className="w-full" size="sm">
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>

        <div className="h-4" />
      </div>
    </DashboardLayout>
  );
}
