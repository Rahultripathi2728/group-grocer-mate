import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers, TrendingUp, Users, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

export default function Auth() {
  const { user, signIn, signUp, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

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
    if (error) toast.error(error.message);
    else toast.success('Welcome back!');
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
    if (error) toast.error(error.message);
    else toast.success('Account created successfully!');
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Hero */}
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
            <div className="p-2 rounded-lg bg-background/10">
              <TrendingUp className="h-6 w-6 text-background" />
            </div>
            <div>
              <h3 className="font-semibold text-background">Track Daily Expenses</h3>
              <p className="text-sm text-background/60">Calendar-based tracking for complete visibility</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-background/10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="p-2 rounded-lg bg-background/10">
              <Users className="h-6 w-6 text-background" />
            </div>
            <div>
              <h3 className="font-semibold text-background">Group Settlements</h3>
              <p className="text-sm text-background/60">Split expenses and settle with friends easily</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-background/10 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="p-2 rounded-lg bg-background/10">
              <ShoppingCart className="h-6 w-6 text-background" />
            </div>
            <div>
              <h3 className="font-semibold text-background">Grocery Lists</h3>
              <p className="text-sm text-background/60">Never forget what to buy again</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-background/40 text-sm">
          © 2024 Expense Manager. Manage your money wisely.
        </p>
      </div>

      {/* Right side - Auth form */}
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
