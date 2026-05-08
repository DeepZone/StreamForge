import { Link, NavLink, useParams } from 'react-router-dom';

type Props = { children: React.ReactNode };

const navItems = [
  { to: '', label: 'Übersicht', end: true },
  { to: 'commands', label: 'Commands' },
  { to: 'timers', label: 'Timer' },
  { to: 'community', label: 'Community Radar' },
  { to: 'recaps', label: 'Recaps' },
  { to: 'campaigns', label: 'Campaigns' },
  { to: 'moderation', label: 'Moderation' },
  { to: 'integrations', label: 'Integrationen' },
  { to: 'settings', label: 'Settings' }
];

export default function ChannelDashboardLayout({ children }: Props) {
  const { channelId = '' } = useParams();
  return (
    <div className='min-h-screen bg-slate-950 text-white'>
      <div className='flex min-h-screen'>
        <aside className='w-72 border-r border-slate-800 p-4 space-y-4'>
          <div>
            <div className='text-xs text-slate-400'>Channel</div>
            <div className='font-semibold break-all'>{channelId}</div>
          </div>
          <nav className='space-y-1'>
            {navItems.map((item) => (
              <NavLink
                key={item.to || 'home'}
                to={`/dashboard/channels/${channelId}/${item.to}`}
                end={item.end}
                className={({ isActive }) => `block rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900'}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Link className='inline-block text-sm underline text-slate-300' to='/channels'>← Zur Kanalauswahl</Link>
        </aside>
        <main className='flex-1 p-6'>{children}</main>
      </div>
    </div>
  );
}
