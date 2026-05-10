import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import PageHeader from '../../components/ui/PageHeader';
import LoadingState from '../../components/ui/LoadingState';
import EmptyState from '../../components/ui/EmptyState';
import ErrorBox from '../../components/ui/ErrorBox';
import StatusBadge from '../../components/ui/StatusBadge';

type Streamer = { channelId: string; displayName: string; twitchLogin: string; isActive: boolean; botEnabled: boolean; owner?: { displayName: string; email?: string }; twitchToken?: { present: boolean; expiresAt?: string }; eventSub?: { status: string; subscribed: boolean; lastError?: string | null }; platformBot?: { moderatorStatus?: string; canSend?: boolean } };

export default function AdminChannels() {
  const [items, setItems] = useState<Streamer[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Streamer[]>('/api/admin/streamers').then(setItems).catch(() => setError('Channels konnten nicht geladen werden.')).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => items.filter((i) => `${i.displayName} ${i.twitchLogin}`.toLowerCase().includes(q.toLowerCase())), [items, q]);
  return <div className='p-6 space-y-4'><PageHeader title='Streamer / Channels' subtitle='Registrierte Channel und Plattformstatus.' /><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder='Suche nach DisplayName oder Twitch Login' className='w-full max-w-md rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm' />{loading ? <LoadingState label='Lade Channels…' /> : error ? <ErrorBox message={error} /> : filtered.length===0 ? <EmptyState title='Keine Channels' description='Es wurden keine Channels gefunden.' /> : <div className='space-y-2'>{filtered.map((s)=><div key={s.channelId} className='rounded border border-zinc-800 bg-zinc-900 p-3'><div className='flex items-center justify-between gap-2'><div><div className='font-medium'>{s.displayName}</div><div className='text-xs text-zinc-400'>@{s.twitchLogin} · Owner: {s.owner?.displayName || '—'}</div></div><div className='flex gap-2'><StatusBadge status={s.isActive ? 'active' : 'inactive'} /><StatusBadge status={s.eventSub?.status || 'unknown'} /></div></div><div className='mt-3 text-xs text-zinc-400'>Token: {s.twitchToken?.present ? 'vorhanden' : 'fehlt'} · Bot: {s.platformBot?.moderatorStatus || 'unknown'} · CanSend: {s.platformBot?.canSend ? 'ja' : 'nein'}</div><Link className='inline-block mt-2 text-xs text-indigo-300' to={`/dashboard/channels/${s.channelId}`}>Dashboard öffnen</Link></div>)}</div>}</div>;
}
