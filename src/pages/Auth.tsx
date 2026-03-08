import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Layers, TrendingUp, Users, ShoppingCart, Eye, EyeOff, ChevronLeft, Loader2, ShieldCheck, Lock, CheckCircle2, Mail } from 'lucide-react';
import { toast } from 'sonner';

type AuthView = 'main' | 'forgot-email' | 'forgot-otp' | 'forgot-newpass' | 'signup-otp';

export default function Auth() {
  const { user, signIn, signUp, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('main');

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotNew, setShowForgotNew] = useState(false);
  const [showForgotConfirm, setShowForgotConfirm] = useState(false);

  // Signup OTP state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupOtp, setSignupOtp] = useState('');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-soft">
          <Layers className="h-12 w-12 text-foreground" />
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const { error } = await signIn(email, password);
    if (error) {
      if (error.message?.includes('Email not confirmed')) {
        toast.error('Please verify your email first. Check your inbox for the verification code.');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Welcome back!');
    }
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;
    const { error } = await signUp(email, password, fullName);
    if (error) {
      toast.error(error.message);
    } else {
      setSignupEmail(email);
      setAuthView('signup-otp');
      toast.success('Verification code sent to your email!');
    }
    setIsLoading(false);
  };

  // Forgot Password - Send OTP
  const handleForgotSendOtp = async () => {
    if (!forgotEmail) { toast.error('Please enter your email'); return; }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: forgotEmail });
      if (error) throw error;
      setAuthView('forgot-otp');
      toast.success('OTP sent to your email!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send OTP');
    } finally { setIsLoading(false); }
  };

  // Forgot Password - Verify OTP
  const handleForgotVerifyOtp = async () => {
    if (forgotOtp.length !== 6) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: forgotEmail,
        token: forgotOtp,
        type: 'email',
      });
      if (error) throw new Error('Invalid OTP code');
      setAuthView('forgot-newpass');
      toast.success('OTP verified!');
    } catch (err: any) {
      toast.error(err.message);
    } finally { setIsLoading(false); }
  };

  // Forgot Password - Set new password
  const handleForgotSetPassword = async () => {
    if (forgotNewPassword !== forgotConfirmPassword) { toast.error('Passwords do not match'); return; }
    if (forgotNewPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: forgotNewPassword });
      if (error) throw error;
      toast.success('Password updated! You are now logged in.');
      // User is now logged in after verifyOtp + updateUser, redirect will happen
    } catch (err: any) {
      toast.error(err.message);
    } finally { setIsLoading(false); }
  };

  // Signup OTP verification
  const handleSignupVerifyOtp = async () => {
    if (signupOtp.length !== 6) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: signupEmail,
        token: signupOtp,
        type: 'signup',
      });
      if (error) throw new Error('Invalid verification code');
      toast.success('Email verified! Welcome to Expense Manager! 🎉');
      // User is now signed in after successful verification
    } catch (err: any) {
      toast.error(err.message);
    } finally { setIsLoading(false); }
  };

  // Resend signup OTP
  const handleResendSignupOtp = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: signupEmail });
      if (error) throw error;
      toast.success('Verification code resent!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend code');
    } finally { setIsLoading(false); }
  };

  const resetToMain = () => {
    setAuthView('main');
    setForgotEmail('');
    setForgotOtp('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setSignupOtp('');
  };

  // Hero section (shared)
  const heroSection = (
    <div className="hidden lg:flex lg:w-1/2 bg-foreground p-12 flex-col justify-between relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-background/10">
            <Layers className="h-8 w-8 text-background" />
          </div>
          <h1 className="text-3xl font-display font-bold text-background">Expense Manager</h1>
        </div>
        <p className="text-background/70 text-lg max-w-md">
          Smart expense management for individuals and groups
        </p>
      </div>
      <div className="relative z-10 space-y-6">
        <div className="flex items-center gap-4 p-4 rounded-xl bg-background/10 animate-slide-up">
          <div className="p-2 rounded-lg bg-background/10"><TrendingUp className="h-6 w-6 text-background" /></div>
          <div>
            <h3 className="font-semibold text-background">Track Daily Expenses</h3>
            <p className="text-sm text-background/60">Calendar-based tracking for complete visibility</p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-4 rounded-xl bg-background/10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="p-2 rounded-lg bg-background/10"><Users className="h-6 w-6 text-background" /></div>
          <div>
            <h3 className="font-semibold text-background">Group Settlements</h3>
            <p className="text-sm text-background/60">Split expenses and settle with friends easily</p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-4 rounded-xl bg-background/10 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="p-2 rounded-lg bg-background/10"><ShoppingCart className="h-6 w-6 text-background" /></div>
          <div>
            <h3 className="font-semibold text-background">Grocery Lists</h3>
            <p className="text-sm text-background/60">Never forget what to buy again</p>
          </div>
        </div>
      </div>
      <p className="relative z-10 text-background/40 text-sm">© 2024 Expense Manager. Manage your money wisely.</p>
    </div>
  );

  // Forgot Password - Email entry
  if (authView === 'forgot-email') {
    return (
      <div className="min-h-screen flex">
        {heroSection}
        <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-md animate-fade-in">
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div className="p-3 rounded-xl bg-foreground"><Layers className="h-8 w-8 text-background" /></div>
              <h1 className="text-2xl font-display font-bold text-foreground">Expense Manager</h1>
            </div>
            <Card className="border border-border shadow-sm">
              <CardHeader className="space-y-1 pb-4">
                <button onClick={resetToMain} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 w-fit">
                  <ChevronLeft className="h-4 w-4" />Back to login
                </button>
                <CardTitle className="text-2xl font-display">Forgot Password</CardTitle>
                <CardDescription>Enter your registered email to receive a verification code</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@example.com" className="h-11" />
                </div>
                <Button onClick={handleForgotSendOtp} disabled={isLoading || !forgotEmail} className="w-full h-11 bg-foreground text-background hover:bg-foreground/90">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : <><Mail className="h-4 w-4 mr-2" />Send Verification Code</>}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Forgot Password - OTP verification
  if (authView === 'forgot-otp') {
    return (
      <div className="min-h-screen flex">
        {heroSection}
        <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-md animate-fade-in">
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div className="p-3 rounded-xl bg-foreground"><Layers className="h-8 w-8 text-background" /></div>
              <h1 className="text-2xl font-display font-bold text-foreground">Expense Manager</h1>
            </div>
            <Card className="border border-border shadow-sm">
              <CardHeader className="space-y-1 pb-4">
                <button onClick={() => setAuthView('forgot-email')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 w-fit">
                  <ChevronLeft className="h-4 w-4" />Back
                </button>
                <CardTitle className="text-2xl font-display">Verify Email</CardTitle>
                <CardDescription>Enter the 6-digit code sent to <strong>{forgotEmail}</strong></CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center py-2">
                  <InputOTP maxLength={6} value={forgotOtp} onChange={setForgotOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button onClick={handleForgotVerifyOtp} disabled={isLoading || forgotOtp.length !== 6} className="w-full h-11 bg-foreground text-background hover:bg-foreground/90">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : <><ShieldCheck className="h-4 w-4 mr-2" />Verify Code</>}
                </Button>
                <button onClick={handleForgotSendOtp} disabled={isLoading} className="text-xs text-muted-foreground hover:text-foreground text-center w-full underline">
                  Resend code
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Forgot Password - Set new password
  if (authView === 'forgot-newpass') {
    return (
      <div className="min-h-screen flex">
        {heroSection}
        <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-md animate-fade-in">
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div className="p-3 rounded-xl bg-foreground"><Layers className="h-8 w-8 text-background" /></div>
              <h1 className="text-2xl font-display font-bold text-foreground">Expense Manager</h1>
            </div>
            <Card className="border border-border shadow-sm">
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm text-success font-medium">Email verified!</span>
                </div>
                <CardTitle className="text-2xl font-display">Set New Password</CardTitle>
                <CardDescription>Create a new password for your account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input type={showForgotNew ? 'text' : 'password'} value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)} placeholder="New password" className="h-11" />
                    <button type="button" onClick={() => setShowForgotNew(!showForgotNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showForgotNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <div className="relative">
                    <Input type={showForgotConfirm ? 'text' : 'password'} value={forgotConfirmPassword} onChange={(e) => setForgotConfirmPassword(e.target.value)} placeholder="Confirm password" className="h-11" />
                    <button type="button" onClick={() => setShowForgotConfirm(!showForgotConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showForgotConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={handleForgotSetPassword} disabled={isLoading || !forgotNewPassword || !forgotConfirmPassword} className="w-full h-11 bg-foreground text-background hover:bg-foreground/90">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Lock className="h-4 w-4 mr-2" />Set Password</>}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Signup OTP verification
  if (authView === 'signup-otp') {
    return (
      <div className="min-h-screen flex">
        {heroSection}
        <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-md animate-fade-in">
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div className="p-3 rounded-xl bg-foreground"><Layers className="h-8 w-8 text-background" /></div>
              <h1 className="text-2xl font-display font-bold text-foreground">Expense Manager</h1>
            </div>
            <Card className="border border-border shadow-sm">
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-4 rounded-full bg-muted">
                    <Mail className="h-8 w-8 text-foreground" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-display text-center">Verify Your Email</CardTitle>
                <CardDescription className="text-center">
                  We've sent a 6-digit verification code to<br />
                  <strong className="text-foreground">{signupEmail}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center py-2">
                  <InputOTP maxLength={6} value={signupOtp} onChange={setSignupOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button onClick={handleSignupVerifyOtp} disabled={isLoading || signupOtp.length !== 6} className="w-full h-11 bg-foreground text-background hover:bg-foreground/90">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : <><CheckCircle2 className="h-4 w-4 mr-2" />Verify & Continue</>}
                </Button>
                <div className="text-center space-y-2">
                  <button onClick={handleResendSignupOtp} disabled={isLoading} className="text-xs text-muted-foreground hover:text-foreground underline">
                    Resend verification code
                  </button>
                  <br />
                  <button onClick={resetToMain} className="text-xs text-muted-foreground hover:text-foreground">
                    ← Back to login
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Main login/signup view
  return (
    <div className="min-h-screen flex">
      {heroSection}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="p-3 rounded-xl bg-foreground">
              <Layers className="h-8 w-8 text-background" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Expense Manager</h1>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <Card className="border border-border shadow-sm">
                <CardHeader className="space-y-1 pb-4">
                  <CardTitle className="text-2xl font-display">Welcome back</CardTitle>
                  <CardDescription>Enter your credentials to access your account</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input id="signin-email" name="email" type="email" placeholder="you@example.com" required className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input id="signin-password" name="password" type="password" placeholder="••••••••" required className="h-11" />
                    </div>
                    <Button type="submit" className="w-full h-11 bg-foreground text-background hover:bg-foreground/90 font-medium" disabled={isLoading}>
                      {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>
                  </form>
                  <button
                    onClick={() => setAuthView('forgot-email')}
                    className="mt-4 text-sm text-muted-foreground hover:text-foreground underline w-full text-center block"
                  >
                    Forgot your password?
                  </button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="signup">
              <Card className="border border-border shadow-sm">
                <CardHeader className="space-y-1 pb-4">
                  <CardTitle className="text-2xl font-display">Create account</CardTitle>
                  <CardDescription>Start tracking your expenses today</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input id="signup-name" name="fullName" type="text" placeholder="John Doe" required className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" name="email" type="email" placeholder="you@example.com" required className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input id="signup-password" name="password" type="password" placeholder="••••••••" required minLength={6} className="h-11" />
                    </div>
                    <Button type="submit" className="w-full h-11 bg-foreground text-background hover:bg-foreground/90 font-medium" disabled={isLoading}>
                      {isLoading ? 'Creating account...' : 'Create Account'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
