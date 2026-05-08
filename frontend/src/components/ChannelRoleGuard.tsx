import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export default function ChannelRoleGuard({ children }: any) {
  const { channelId } = useParams();
  const { user } = useAuth();
  if (!user) return <Navigate to='/login' replace />;
  const hasAccess = user.role === 'system_owner' || user.role === 'platform_admin' || user.channels.some((c: any) => c.channelId === channelId);
  if (!hasAccess) return <Navigate to='/channels' replace />;
  return children;
}
