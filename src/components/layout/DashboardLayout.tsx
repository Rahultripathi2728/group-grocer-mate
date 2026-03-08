import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LogOut,
  User,
} from 'lucide-react';
import BottomNav from './BottomNav';
import NotificationBell from '@/components/notifications/NotificationBell';
import PushNotificationPrompt from '@/components/notifications/PushNotificationPrompt';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const userName = user?.user_metadata?.full_name || 'User';
  const userInitials = userName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-foreground">
              <Layers className="h-4 w-4 text-background" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-sm leading-tight">SplitSmart</span>
              <span className="text-[10px] font-semibold text-primary leading-tight">● PREMIUM</span>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-1.5 rounded-full border border-border hover:bg-muted transition-colors">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      <User className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{userName.split(' ')[0]}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="text-muted-foreground text-xs">
                  {user?.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Desktop Header */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-8 h-16 w-full max-w-7xl mx-auto">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-foreground">
              <Layers className="h-5 w-5 text-background" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-lg leading-tight">SplitSmart</span>
              <span className="text-[10px] font-semibold text-primary leading-tight">● PREMIUM</span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 px-4 py-2 rounded-full border border-border hover:bg-muted transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm">{userName}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="text-muted-foreground text-xs">
                  {user?.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-14 lg:pt-16 pb-20 lg:pb-8 min-h-screen">
        <PushNotificationPrompt />
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <BottomNav />
    </div>
  );
}
