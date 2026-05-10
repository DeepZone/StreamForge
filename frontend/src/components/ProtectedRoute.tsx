import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export default function ProtectedRoute({ children }: any) {
  const { user, loading } = useAuth();
  if (loading) return <div className='p-6'>Loading...</div>;
  if (!user) return <Navigate to='/login' replace />;
  return children;
}

export const isSystemAdmin = (role?: string) => role === 'system_owner' || role === 'platform_admin';
