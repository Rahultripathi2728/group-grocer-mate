import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { appLogo } from '@/lib/assets';

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse-soft">
          <img src={appLogo} alt="Expense Manager" className="h-12 w-12 rounded-xl" />
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/auth" replace />;
};

export default Index;
