import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import Card from '../../components/ui/Card';
import LoadingState from '../../components/ui/LoadingState';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';

export default function AdminHealth() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [cleanupResult, setCleanupResult] = useState<any>(null);
  const load = async () => setData(await apiGet('/api/admin/health'));
  const cleanup = async (channelId?: string) => {
    const result = await apiPost('/api/admin/twitch/subscriptions/cleanup', channelId ? { channelId } : {});
    setCleanupResult(result);
    await load();
  };
  useEffect(() => { void load().catch(() => setData({ error: true })); }, []);
  if (user && !['system_owner', 'platform_admin'].includes(user.role)) return <Navigate to='/channels' replace />;
  if (!data) return <LoadingState label='Admin Health wird geladen…' />;
  const sessions = data?.twitch?.sessions ?? []; const transports = data?.twitch?.transports ?? [];
  return <div className='p-6 space-y-4'><PageHeader title='Admin Health' subtitle='Betriebszustand von API, Datenbank und Twitch EventSub.'/><Card className='p-4 grid md:grid-cols-5 gap-3 text-sm'><div>API: <StatusBadge status={data?.backend || 'unknown'} /></div><div>DB: <StatusBadge status={data?.db || 'unknown'} /></div><div>Redis: <StatusBadge status={data?.redis || 'unknown'} /></div><div>EventSub enabled: <StatusBadge status={String(Boolean(data?.twitch?.eventSubEnabled)) === 'true' ? 'connected' : 'disconnected'} /></div><div>EventSub connected: <StatusBadge status={data?.twitch?.connected ? 'connected' : 'disconnected'} /></div></Card>
  <Card className='p-4 space-y-2'><h2 className='font-semibold'>EventSub Transports</h2>{transports.map((t:any)=><div key={t.key||t.transportKey} className='text-sm rounded-lg border border-zinc-700 p-2'>{t.key||t.transportKey} · Connected: <StatusBadge status={t.connected?'connected':'disconnected'} /> · Session: {t.sessionId?'ja':'nein'} · Channels: {(t.channels||[]).length} · Last Welcome: {t.lastWelcomeAt||'-'} · Last Error: {t.lastError||'-'}</div>)}</Card>
  <Card className='p-4 space-y-2'><h2 className='font-semibold'>Sessions</h2>{sessions.map((s:any)=><div key={s.channelId||s.channel} className='text-sm rounded-lg border border-zinc-700 p-2'>{s.channel||s.channelId} · <StatusBadge status={s.status||'unknown'} /> · Connected: {String(Boolean(s.connected))} · Subscribed: {String(Boolean(s.subscribed))} · Subs: {s.subscriptions??0} · LastConnected: {s.lastConnectedAt||'-'} · LastSubscription: {s.lastSubscriptionAt||'-'} · LastMessage: {s.lastMessageAt||'-'} · LastError: {s.lastError||'-'} · Reconnects: {s.reconnects??0} {String(s.lastError||'').includes('maximum subscriptions with type and condition exceeded') && <span className='ml-2 text-amber-300'>Es existieren vermutlich alte Twitch EventSub Subscriptions. Cleanup ausführen.</span>}<button className='ml-2 rounded-lg border border-zinc-700 px-2 py-1' onClick={()=>void cleanup(s.channelId)}>Cleanup Channel Subscriptions</button><button className='ml-2 rounded-lg border border-zinc-700 px-2 py-1' onClick={()=>void apiPost(`/api/admin/twitch/eventsub/restart-session`,{channelId:s.channelId}).then(load)}>Restart Session</button></div>)}</Card>
  {cleanupResult?.cleaned && <Card className='p-4 text-sm'>Cleanup Ergebnis: {JSON.stringify(cleanupResult.cleaned)}</Card>}
  {data?.twitch?.startAllSummary && <Card className='p-4 text-sm'>started: {data.twitch.startAllSummary.started ?? 0} · skipped: {data.twitch.startAllSummary.skipped ?? 0} · failed: {data.twitch.startAllSummary.failed ?? 0} · reasons: {JSON.stringify(data.twitch.startAllSummary.reasons ?? {})} · updatedAt: {data.twitch.startAllSummary.updatedAt ?? '-'}</Card>}
  <div className='flex gap-2'><button className='rounded-lg bg-zinc-700 px-3 py-2 text-sm' onClick={()=>void cleanup()}>Cleanup EventSub Subscriptions</button><button className='rounded-lg bg-indigo-600 px-3 py-2 text-sm' onClick={()=>void apiPost('/api/admin/twitch/eventsub/restart').then(load)}>Restart EventSub</button></div></div>;
}
