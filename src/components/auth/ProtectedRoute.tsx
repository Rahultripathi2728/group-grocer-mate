import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layers } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-soft flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-foreground">
            <Layers className="h-8 w-8 text-background" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
