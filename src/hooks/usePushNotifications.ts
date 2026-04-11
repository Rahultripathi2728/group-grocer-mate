import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { appBasePath, getAppPath } from '@/lib/assets';

function getAppServiceWorkerScope() {
  return new URL(appBasePath, window.location.origin).href;
}

async function getAppServiceWorkerRegistration() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const appScope = getAppServiceWorkerScope();

  return registrations.find((registration) => registration.scope === appScope) ?? null;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!user || !isSupported) return;
    checkExistingSubscription();
  }, [user, isSupported]);

  const checkExistingSubscription = async () => {
    try {
      const registration = await getAppServiceWorkerRegistration();
      if (!registration) {
        setIsSubscribed(false);
        return;
      }

      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch {
      // Ignore
    }
  };

  const subscribe = async () => {
    if (!user || !isSupported) return false;

    try {
      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      let registration = await getAppServiceWorkerRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register(getAppPath('sw.js'), {
          scope: appBasePath,
        });
      }

      if (!registration.active) {
        await navigator.serviceWorker.ready;
        registration = (await getAppServiceWorkerRegistration()) ?? registration;
      }

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Get VAPID public key from edge function
        const { data: vapidData, error: vapidError } = await supabase.functions.invoke('get-vapid-public-key');
        if (vapidError) throw vapidError;
        if (!vapidData?.publicKey) {
          throw new Error('Could not get VAPID public key');
        }

        // Convert VAPID key to Uint8Array
        const vapidKeyBytes = urlBase64ToUint8Array(vapidData.publicKey) as unknown as ArrayBuffer;

        // Subscribe to push
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes,
        });
      }

      const subJson = subscription.toJSON();
      const endpoint = subJson.endpoint;
      const p256dh = subJson.keys?.p256dh;
      const auth = subJson.keys?.auth;

      if (!endpoint || !p256dh || !auth) {
        throw new Error('Incomplete push subscription received');
      }

      const { data: existingRecord, error: existingRecordError } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('endpoint', endpoint)
        .maybeSingle();

      if (existingRecordError) throw existingRecordError;

      if (!existingRecord) {
        const { error: insertError } = await supabase.from('push_subscriptions').insert({
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
        });

        if (insertError && insertError.code !== '23505') {
          throw insertError;
        }
      }

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return false;
    }
  };

  const unsubscribe = async () => {
    try {
      const registration = await getAppServiceWorkerRegistration();
      if (!registration) {
        setIsSubscribed(false);
        return;
      }

      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        if (user) {
          await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
        }
      }
      setIsSubscribed(false);
    } catch (error) {
      console.error('Unsubscribe failed:', error);
    }
  };

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
