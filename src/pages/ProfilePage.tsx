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
  Smartphone, ArrowRight, Eye, EyeOff, ChevronLeft, Loader2, KeyRound, ShieldCheck
} from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { getAbsoluteAppUrl } from '@/lib/assets';

type PasswordMode = 'idle' | 'change' | 'forgot-sent';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [upiId, setUpiId] = useState('');
  const [saving, setSaving] = useState(false);

  // Password state
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('idle');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.user_metadata?.full_name || '');
      setEmail(user.email || '');
      supabase.from('profiles').select('upi_id').eq('id', user.id).single().then(({ data }) => {
        if (data?.upi_id) setUpiId(data.upi_id);
      });
    }
  }, [user]);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const userInitials = fullName?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || email?.[0]?.toUpperCase() || 'U';

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
      if (authError) throw authError;
      await supabase.from('profiles').update({ full_name: fullName, upi_id: upiId || null } as any).eq('id', user.id);
      toast({ title: 'Profile updated! ✅' });
    } catch (err: any) {
      toast({ title: 'Error updating profile', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const resetPasswordFlow = () => {
    setPasswordMode('idle');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  // Change Password with current password
  const handleChangeWithCurrentPassword = async () => {
    if (!user?.email) return;
    if (newPassword !== confirmPassword) { toast({ title: 'Passwords do not match', variant: 'destructive' }); return; }
    if (newPassword.length < 6) { toast({ title: 'Password must be at least 6 characters', variant: 'destructive' }); return; }

    setProcessing(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) throw new Error('Current password is incorrect');

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({ title: 'Password changed successfully! 🔒' });
      resetPasswordFlow();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setProcessing(false); }
  };

  // Forgot Password - Send reset link via email
  const handleSendResetLink = async () => {
    if (!user?.email) return;
    setProcessing(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: getAbsoluteAppUrl('reset-password'),
      });
      if (error) throw error;
      setPasswordMode('forgot-sent');
      toast({ title: 'Reset link sent! 📧', description: 'Check your email for the password reset link' });
    } catch (err: any) {
      toast({ title: 'Failed to send reset link', description: err.message, variant: 'destructive' });
    } finally { setProcessing(false); }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') { setIsInstalled(true); toast({ title: 'App installed! 🎉' }); }
    setDeferredPrompt(null);
  };

  const handleTogglePush = async () => {
    if (isSubscribed) { await unsubscribe(); toast({ title: 'Notifications turned off' }); }
    else { const success = await subscribe(); if (success) toast({ title: 'Notifications enabled! 🔔' }); else toast({ title: 'Could not enable notifications', variant: 'destructive' }); }
  };

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -mb-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex flex-col items-center gap-3 py-4">
          <Avatar className="h-20 w-20 border border-border">
            <AvatarFallback className="bg-foreground text-background text-2xl font-bold">{userInitials}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{fullName || 'User'}</h1>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>

        {/* Profile Details */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Profile Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-xs">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upiId" className="text-xs">UPI ID</Label>
              <Input id="upiId" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. yourname@upi" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{email}</span>
              </div>
            </div>
            <Button onClick={handleSaveProfile} disabled={saving} size="sm" className="w-full">
              <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Password Section */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Idle - show two options */}
            {passwordMode === 'idle' && (
              <div className="space-y-3">
                <Button onClick={() => setPasswordMode('change')} size="sm" variant="outline" className="w-full justify-start">
                  <KeyRound className="h-4 w-4 mr-2" />
                  Change Password
                  <span className="ml-auto text-[11px] text-muted-foreground">I know my password</span>
                </Button>
                <Button onClick={handleSendResetLink} disabled={processing} size="sm" variant="outline" className="w-full justify-start">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Forgot Password
                  <span className="ml-auto text-[11px] text-muted-foreground">Reset via email link</span>
                </Button>
              </div>
            )}

            {/* Change Password - current password method */}
            {passwordMode === 'change' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Current Password</Label>
                  <div className="relative">
                    <Input type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
                    <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">New Password</Label>
                  <div className="relative">
                    <Input type={showNew ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Confirm New Password</Label>
                  <div className="relative">
                    <Input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={resetPasswordFlow} size="sm" variant="ghost" className="flex-1">Cancel</Button>
                  <Button onClick={handleChangeWithCurrentPassword} disabled={processing || !currentPassword || !newPassword || !confirmPassword} size="sm" className="flex-1">
                    {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Changing...</> : <><Lock className="h-4 w-4 mr-2" />Change Password</>}
                  </Button>
                </div>
              </div>
            )}

            {/* Forgot Password - Link sent confirmation */}
            {passwordMode === 'forgot-sent' && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-success/10 border border-success/20 text-center">
                  <Mail className="h-6 w-6 text-success mx-auto mb-2" />
                  <p className="text-sm font-medium text-success">Reset link sent!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong>{email}</strong> pe password reset link bheja gaya hai.<br />
                    Email mein link pe click karke naya password set karein.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={resetPasswordFlow} size="sm" variant="ghost" className="flex-1">Close</Button>
                  <Button onClick={handleSendResetLink} disabled={processing} size="sm" variant="outline" className="flex-1">
                    {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : 'Resend Link'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* App & Notifications */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              App & Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isInstalled ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border">
                <div className="flex items-center gap-3">
                  <Download className="h-5 w-5 text-foreground" />
                  <div>
                    <p className="text-sm font-medium">Install App</p>
                    <p className="text-xs text-muted-foreground">Add to home screen</p>
                  </div>
                </div>
                {deferredPrompt ? (
                  <Button size="sm" variant="outline" onClick={handleInstall}>Install</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => navigate('/install')}><ArrowRight className="h-4 w-4" /></Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-foreground text-sm p-3 rounded-lg bg-muted">
                <CheckCircle2 className="h-4 w-4" />App installed!
              </div>
            )}
            {isSupported && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-foreground" />
                  <div>
                    <p className="text-sm font-medium">Push Notifications</p>
                    <p className="text-xs text-muted-foreground">{isSubscribed ? 'Enabled' : 'Disabled'}</p>
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

        <Button onClick={handleSignOut} variant="destructive" className="w-full" size="sm">
          <LogOut className="h-4 w-4 mr-2" />Sign Out
        </Button>

        <div className="h-4" />
      </div>
    </DashboardLayout>
  );
}
