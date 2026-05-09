import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { apiGet } from '../api/client';
import { getChannelDisplayName, getChannelHandle, isFallbackChannelName, truncateId, type ChannelLike } from '../utils/channelDisplay';

type ChannelOption = ChannelLike & { id: string; role: string };

export default function ChannelSelectPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<ChannelOption[]>([]);

  useEffect(() => {
    if (!loading && user?.channels?.length === 1) {
      navigate(`/dashboard/channels/${user.channels[0].channelId}`, { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    apiGet<ChannelOption[]>('/api/channels').then(setChannels).catch(() => setChannels([]));
  }, [user]);

  if (loading) return <div className='p-6'>Loading...</div>;
  if (!user) return <div className='p-6'>Nicht eingeloggt.</div>;
  if (!user.channels.length) return <div className='p-6'>Kein Kanal zugeordnet. Bitte zuerst über Twitch anmelden.</div>;

  return <div className='p-6 grid gap-3 md:grid-cols-2'>{channels.map((c) => { const displayName = getChannelDisplayName(c); const handle = getChannelHandle(c); const fallback = isFallbackChannelName(c); return <Link key={c.id} className='block rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-indigo-500' to={`/dashboard/channels/${c.id}`}><div className='font-semibold'>{displayName}</div>{handle && <div className='text-sm text-zinc-400'>{handle}</div>}<div className='text-xs text-zinc-500 mt-2'>Rolle: {c.role}</div>{fallback && <div className='text-xs text-zinc-500'>ID: {truncateId(c.id)}</div>}</Link>; })}</div>;
}
