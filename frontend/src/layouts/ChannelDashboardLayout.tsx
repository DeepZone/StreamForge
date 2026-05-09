import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { apiGet } from '../api/client';
import { getChannelDisplayName, getChannelHandle, isFallbackChannelName, truncateId, type ChannelLike } from '../utils/channelDisplay';

const nav = [['', 'Übersicht'], ['live-chat', 'Live Chat'], ['chatters', 'Chatters'], ['commands', 'Commands'], ['timers', 'Timer'], ['community', 'Community Radar'], ['recaps', 'Recaps'], ['campaigns', 'Campaigns'], ['moderation', 'Moderation'], ['integrations', 'Integrationen'], ['settings', 'Settings'], ['logs', 'Logs']];

export default function ChannelDashboardLayout({ children }: { children: React.ReactNode }) {
  const { channelId = '' } = useParams();
  const [channel, setChannel] = useState<ChannelLike | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await apiGet<ChannelLike>(`/api/channels/${channelId}`);
        setChannel(data);
      } catch {
        setError(true);
        setChannel({ id: channelId });
      } finally {
        setLoading(false);
      }
    };
    if (channelId) void load();
  }, [channelId]);

  const displayName = loading ? 'Lade Channel…' : getChannelDisplayName(channel);
  const handle = loading ? '' : getChannelHandle(channel);
  const showFallbackId = !loading && isFallbackChannelName(channel);

  return <div className='grid md:grid-cols-[240px_1fr] gap-4'><aside className='rounded-xl border bg-zinc-900 p-4 h-fit sticky top-4'><div className='text-xs text-zinc-400'>Channel</div><div className='font-semibold mb-1'>{displayName}</div>{handle && <div className='text-xs text-zinc-400 mb-3'>{handle}</div>}{showFallbackId && <div className='text-xs text-zinc-500 mb-3'>ID: {truncateId(channel?.id || channelId)}</div>}{error && <div className='text-xs text-amber-400 mb-3'>Channel-Daten konnten nicht geladen werden.</div>}<div className='space-y-1'>{nav.map(([to, l]) => <NavLink end={!to} key={to || 'home'} to={`/dashboard/channels/${channelId}/${to}`} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}>{l}</NavLink>)}</div><Link className='block mt-4 text-sm' to='/channels'>← Zur Kanalauswahl</Link></aside><div>{children}</div></div>;
}
