import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';
import BottomNav from './BottomNav';
import NotificationBell from '@/components/notifications/NotificationBell';
import PushNotificationPrompt from '@/components/notifications/PushNotificationPrompt';
import { appLogo } from '@/lib/assets';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <img src={appLogo} alt="Expense Manager" className="h-8 w-8 rounded-lg grayscale" />
            <span className="font-display font-bold text-sm leading-tight">Expense Manager</span>
          </Link>

          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => navigate('/profile')}
              className="p-2 rounded-full border border-border hover:bg-muted transition-colors"
            >
              <User className="h-4 w-4 text-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop Header */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-8 h-16 w-full max-w-7xl mx-auto">
          <Link to="/dashboard" className="flex items-center gap-3">
            <img src={appLogo} alt="Expense Manager" className="h-9 w-9 rounded-xl grayscale" />
            <span className="font-display font-bold text-lg leading-tight">Expense Manager</span>
          </Link>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => navigate('/profile')}
              className="p-2.5 rounded-full border border-border hover:bg-muted transition-colors"
            >
              <User className="h-5 w-5 text-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-14 lg:pt-16 pb-16 sm:pb-20 lg:pb-8 min-h-screen">
        <PushNotificationPrompt />
        <div className="px-3 py-3 sm:p-4 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <BottomNav />
    </div>
  );
}
