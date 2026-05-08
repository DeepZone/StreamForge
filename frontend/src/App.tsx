import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import ChannelRoleGuard from './components/ChannelRoleGuard';
import LoginPage from './pages/LoginPage';
import ChannelSelectPage from './pages/ChannelSelectPage';
import SetupPage from './pages/SetupPage';
import { useAuth } from './auth/AuthProvider';
import ChannelDashboardLayout from './layouts/ChannelDashboardLayout';
import DashboardHome from './pages/DashboardHome';
import CommandsPage from './pages/CommandsPage';
import TimersPage from './pages/TimersPage';
import CommunityPage from './pages/CommunityPage';
import RecapsPage from './pages/RecapsPage';
import CampaignsPage from './pages/CampaignsPage';
import ModerationPage from './pages/ModerationPage';
import IntegrationsPage from './pages/IntegrationsPage';
import SettingsPage from './pages/SettingsPage';
import AdminHealth from './pages/admin/AdminHealth';

const HomeRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className='p-6'>Loading...</div>;
  if (!user) return <Navigate to='/login' replace />;
  if (user.channels?.length) return <Navigate to={`/dashboard/channels/${user.channels[0].channelId}`} replace />;
  return <Navigate to='/channels' replace />;
};

const ChannelShell = () => <ProtectedRoute><ChannelRoleGuard><ChannelDashboardLayout><Outlet /></ChannelDashboardLayout></ChannelRoleGuard></ProtectedRoute>;

export default function App() {
  const { user } = useAuth();
  return (
    <div>
      <nav className='p-2 bg-slate-900 text-white flex gap-3'>
        <Link to='/setup'>Setup</Link><Link to='/login'>Login</Link><Link to='/channels'>Channels</Link>{user ? <Link to='/admin/health'>Admin Health</Link> : null}
      </nav>
      <Routes>
        <Route path='/' element={<HomeRedirect />} />
        <Route path='/setup' element={<SetupPage />} />
        <Route path='/login' element={<LoginPage />} />
        <Route path='/channels' element={<ProtectedRoute><ChannelSelectPage /></ProtectedRoute>} />
        <Route path='/dashboard/channels/:channelId' element={<ChannelShell />}>
          <Route index element={<DashboardHome />} />
          <Route path='commands' element={<CommandsPage />} />
          <Route path='timers' element={<TimersPage />} />
          <Route path='community' element={<CommunityPage />} />
          <Route path='recaps' element={<RecapsPage />} />
          <Route path='campaigns' element={<CampaignsPage />} />
          <Route path='moderation' element={<ModerationPage />} />
          <Route path='integrations' element={<IntegrationsPage />} />
          <Route path='settings' element={<SettingsPage />} />
        </Route>
        <Route path='/admin/health' element={<ProtectedRoute><AdminHealth /></ProtectedRoute>} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </div>
  );
}
