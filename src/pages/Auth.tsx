import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Users, ShoppingCart, ChevronLeft, Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type AuthView = 'main' | 'forgot-email' | 'forgot-sent' | 'signup-sent';

export default function Auth() {
  const { user, signIn, signUp, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('main');

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');

  // Signup confirmation state
  const [signupEmail, setSignupEmail] = useState('');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-soft">
          <img src="/app-logo.png" alt="Expense Manager" className="h-12 w-12" />
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
        toast.error('Pehle apni email verify karein. Apna inbox check karein.');
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
      setAuthView('signup-sent');
      toast.success('Confirmation email sent!');
    }
    setIsLoading(false);
  };

  // Forgot Password - Send reset link
  const handleForgotSendLink = async () => {
    if (!forgotEmail) { toast.error('Please enter your email'); return; }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setAuthView('forgot-sent');
      toast.success('Password reset link sent to your email!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reset link');
    } finally { setIsLoading(false); }
  };

  const resetToMain = () => {
    setAuthView('main');
    setForgotEmail('');
    setSignupEmail('');
  };

  // Hero section (shared)
  const heroSection = (
    <div className="hidden lg:flex lg:w-1/2 bg-foreground p-12 flex-col justify-between relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-background/10">
            <img src="/app-logo.png" alt="Expense Manager" className="h-10 w-10" />
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
                <CardDescription>Enter your registered email. We'll send a password reset link.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@example.com" className="h-11" />
                </div>
                <Button onClick={handleForgotSendLink} disabled={isLoading || !forgotEmail} className="w-full h-11 bg-foreground text-background hover:bg-foreground/90">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : <><Mail className="h-4 w-4 mr-2" />Send Reset Link</>}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Forgot Password - Link sent confirmation
  if (authView === 'forgot-sent') {
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
              <CardHeader className="space-y-1 pb-4 text-center">
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-full bg-success/10">
                    <Mail className="h-8 w-8 text-success" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-display">Check Your Email</CardTitle>
                <CardDescription>
                  Password reset link bhej diya gaya hai<br />
                  <strong className="text-foreground">{forgotEmail}</strong><br />
                  Email mein link pe click karke naya password set karein.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleForgotSendLink} disabled={isLoading} variant="outline" className="w-full">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : 'Resend Link'}
                </Button>
                <button onClick={resetToMain} className="text-sm text-muted-foreground hover:text-foreground underline w-full text-center block">
                  ← Back to login
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Signup - Confirmation email sent
  if (authView === 'signup-sent') {
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
              <CardHeader className="space-y-1 pb-4 text-center">
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-full bg-success/10">
                    <CheckCircle2 className="h-8 w-8 text-success" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-display">Verify Your Email</CardTitle>
                <CardDescription>
                  Confirmation link bhej diya gaya hai<br />
                  <strong className="text-foreground">{signupEmail}</strong><br />
                  Email mein link pe click karke apna account verify karein, fir login karein.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={resetToMain} className="w-full h-11 bg-foreground text-background hover:bg-foreground/90">
                  Back to Login
                </Button>
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
