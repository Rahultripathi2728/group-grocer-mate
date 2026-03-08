import { useState, useEffect } from 'react';
import { Download, Share, Smartphone, CheckCircle2, ArrowLeft, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const { isSupported, isSubscribed, subscribe } = usePushNotifications();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Detect iOS
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      toast({ title: 'App install ho gayi! 🎉' });
    }
    setDeferredPrompt(null);
  };

  const handleEnablePush = async () => {
    const success = await subscribe();
    if (success) {
      toast({ title: 'Notifications enabled! 🔔' });
    } else {
      toast({ title: 'Could not enable notifications', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-md mx-auto space-y-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="text-center space-y-2">
          <img src="/pwa-icon-192.png" alt="My Moolah" className="w-20 h-20 mx-auto rounded-2xl shadow-lg" />
          <h1 className="text-2xl font-bold text-foreground">My Moolah Install Karein</h1>
          <p className="text-muted-foreground text-sm">
            Apne phone ke home screen par add karein — real app jaisi feel!
          </p>
        </div>

        {/* Install Card */}
        <Card className="border-primary/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">App Install Karein</h3>
                <p className="text-xs text-muted-foreground">Home screen se directly open karein</p>
              </div>
            </div>

            {isInstalled ? (
              <div className="flex items-center gap-2 text-primary text-sm">
                <CheckCircle2 className="h-4 w-4" />
                App already installed hai!
              </div>
            ) : deferredPrompt ? (
              <Button onClick={handleInstall} className="w-full" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Install App
              </Button>
            ) : isIOS ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">iPhone/iPad par install karne ke liye:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-xs">
                  <li className="flex items-start gap-2">
                    <Share className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                    <span>Safari mein <strong>Share</strong> button dabayein</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Download className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                    <span><strong>"Add to Home Screen"</strong> select karein</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                    <span><strong>"Add"</strong> dabayein — done!</span>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Browser menu se "Add to Home Screen" ya "Install App" select karein
              </div>
            )}
          </CardContent>
        </Card>

        {/* Push Notifications Card */}
        {isSupported && (
          <Card className="border-primary/20">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Push Notifications</h3>
                  <p className="text-xs text-muted-foreground">Expense aur group updates milte rahein</p>
                </div>
              </div>

              {isSubscribed ? (
                <div className="flex items-center gap-2 text-primary text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Notifications already enabled hain!
                </div>
              ) : (
                <Button onClick={handleEnablePush} variant="outline" className="w-full" size="sm">
                  <Bell className="h-4 w-4 mr-2" />
                  Enable Notifications
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Install karne ke baad app offline bhi kaam karegi ⚡
        </p>
      </div>
    </div>
  );
}
