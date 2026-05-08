import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import ChannelRoleGuard from './components/ChannelRoleGuard';
import LoginPage from './pages/LoginPage';
import ChannelSelectPage from './pages/ChannelSelectPage';
import SetupPage from './pages/SetupPage';
import { useAuth } from './auth/AuthProvider';

const Dashboard = () => <div className='p-6'>Channel Dashboard</div>;

const HomeRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className='p-6'>Loading...</div>;
  return <Navigate to={user ? '/channels' : '/login'} replace />;
};

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
        <Route path='/dashboard/channels/:channelId' element={<ProtectedRoute><ChannelRoleGuard><Dashboard /></ChannelRoleGuard></ProtectedRoute>} />
        <Route path='/admin/health' element={<ProtectedRoute><div className='p-6'>Admin Health</div></ProtectedRoute>} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </div>
  );
}
