import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { apiPost } from '../api/client';

const navItems = [
  ['/admin', 'Übersicht'],
  ['/admin/users', 'Benutzer'],
  ['/admin/streamers', 'Streamer / Channels'],
  ['/admin/twitch', 'Twitch / EventSub'],
  ['/admin/health', 'System Health'],
  ['/admin/settings', 'Einstellungen']
] as const;

export default function AdminLayout() {
  const { user, refresh } = useAuth();

  const logout = async () => {
    await apiPost('/api/auth/logout');
    await refresh();
  };

  return (
    <div className='grid gap-4 md:grid-cols-[250px_1fr]'>
      <aside className='h-fit rounded-xl border border-zinc-800 bg-zinc-900 p-4 sticky top-4'>
        <div className='text-xs text-zinc-400'>StreamForge Admin</div>
        <div className='font-semibold'>{user?.displayName}</div>
        <div className='text-xs text-zinc-400 mb-4'>Rolle: {user?.role}</div>
        <div className='space-y-1'>
          {navItems.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}>
              {label}
            </NavLink>
          ))}
        </div>
        <Link to='/dashboard/channels' className='block mt-4 text-xs text-zinc-400 hover:text-zinc-200'>Streamer-Dashboard öffnen</Link>
        <button onClick={logout} className='mt-4 rounded bg-zinc-700 px-3 py-2 text-sm text-white'>Logout</button>
      </aside>
      <main><Outlet /></main>
    </div>
  );
}
