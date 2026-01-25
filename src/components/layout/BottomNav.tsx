import { Link, useLocation } from 'react-router-dom';
import { Calendar, BarChart3, ShoppingCart, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard', label: 'Expenses', icon: BarChart3 },
  { href: '/grocery', label: 'List', icon: ShoppingCart },
  { href: '/groups', label: 'Groups', icon: Users },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t shadow-lg">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all duration-200 min-w-[64px]',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div
                className={cn(
                  'p-1.5 rounded-lg transition-all duration-200',
                  isActive && 'bg-primary/10'
                )}
              >
                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
              </div>
              <span className={cn('text-xs font-medium', isActive && 'text-primary')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
