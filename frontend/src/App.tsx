import { Routes, Route, Link } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import ChannelRoleGuard from './components/ChannelRoleGuard';
import LoginPage from './pages/LoginPage';
import ChannelSelectPage from './pages/ChannelSelectPage';

const Dashboard = () => <div className='p-6'>Channel Dashboard</div>;

export default function App() {
  return (
    <div>
      <nav className='p-2 bg-slate-900 text-white flex gap-3'><Link to='/login'>Login</Link><Link to='/channels'>Channels</Link></nav>
      <Routes>
        <Route path='/login' element={<LoginPage />} />
        <Route path='/channels' element={<ProtectedRoute><ChannelSelectPage /></ProtectedRoute>} />
        <Route path='/dashboard/channels/:channelId' element={<ProtectedRoute><ChannelRoleGuard><Dashboard /></ChannelRoleGuard></ProtectedRoute>} />
        <Route path='*' element={<LoginPage />} />
      </Routes>
    </div>
  );
}
