import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import Button from '../components/ui/Button';

type SetupStatus = { setupAllowed: boolean };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth() as any;
  const [setupAllowed, setSetupAllowed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<SetupStatus>('/api/setup/status')
      .then((status) => {
        if (!cancelled) setSetupAllowed(status.setupAllowed);
      })
      .catch(() => {
        if (!cancelled) setSetupAllowed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const navLinks = [
    ...(setupAllowed ? ['/setup'] : []),
    ...(!user ? ['/login'] : []),
    '/channels'
  ];

  return <div className='min-h-screen bg-zinc-950 text-zinc-100'><header className='border-b bg-zinc-950/80 backdrop-blur'><div className='mx-auto max-w-7xl px-4 py-3 flex items-center justify-between'><div className='font-bold text-lg'>StreamForge</div><nav className='flex gap-1 text-sm'>{navLinks.map(p => <NavLink key={p} className='px-3 py-2 rounded-lg hover:bg-zinc-800' to={p}>{p.slice(1)}</NavLink>)}{user && <NavLink className='px-3 py-2 rounded-lg hover:bg-zinc-800' to='/admin/health'>Admin Health</NavLink>}</nav><div className='flex items-center gap-2 text-xs'>{user && <><span>{user.displayName} · {user.role}</span><Button variant='secondary' onClick={logout}>Logout</Button></>}</div></div></header><main className='mx-auto max-w-7xl px-4 py-6'>{children}</main></div>;
}
