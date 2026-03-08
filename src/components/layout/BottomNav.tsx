import { Link, useLocation } from 'react-router-dom';
import { Calendar, Wallet, Users, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const navItems = [
  { href: '/dashboard', label: 'Calendar', icon: Calendar },
  { href: '/expenses', label: 'Expenses', icon: Wallet },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/list', label: 'List', icon: ShoppingCart },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className="relative flex items-center justify-center"
            >
              {isActive ? (
                <motion.div
                  layoutId="activeTab"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                >
                  <item.icon className="h-4.5 w-4.5 text-background" />
                  <span className="text-xs font-semibold text-background">
                    {item.label}
                  </span>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center px-3 py-2">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </Link>
          );
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="h-safe-area-inset-bottom bg-background" />
    </nav>
  );
}
