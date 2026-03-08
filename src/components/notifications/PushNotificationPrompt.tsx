import { useState } from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function PushNotificationPrompt() {
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('push-prompt-dismissed') === 'true');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (!isSupported || isSubscribed || dismissed || permission === 'denied') return null;

  const handleSubscribe = async () => {
    setLoading(true);
    const success = await subscribe();
    setLoading(false);
    if (success) {
      toast({ title: 'Notifications enabled! 🔔', description: 'App band hone par bhi notifications aayenge.' });
    } else {
      toast({ title: 'Could not enable notifications', variant: 'destructive' });
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('push-prompt-dismissed', 'true');
  };

  return (
    <div className="relative mx-4 mt-4 p-4 rounded-xl border bg-card/80 backdrop-blur-sm animate-fade-in">
      <button onClick={handleDismiss} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <BellRing className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm">Push Notifications Enable Karein</h4>
          <p className="text-xs text-muted-foreground mt-1">
            App band hone par bhi expense aur group updates ki notification milegi
          </p>
          <Button 
            size="sm" 
            className="mt-3 h-8 text-xs" 
            onClick={handleSubscribe}
            disabled={loading}
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            {loading ? 'Enabling...' : 'Enable Notifications'}
          </Button>
        </div>
      </div>
    </div>
  );
}
