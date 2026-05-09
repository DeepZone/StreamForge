import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { getChannelDisplayName, getChannelHandle, isFallbackChannelName, truncateId } from '../../utils/channelDisplay';

export default function AdminHealth() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => setData(await apiGet('/api/admin/health'));
  const action = async (path: string) => { setLoading(true); await apiPost(path); await load(); setLoading(false); };
  useEffect(() => { load().catch(() => setData({ error: true })); apiGet('/api/admin/twitch/config').then(setCfg).catch(() => null); }, []);
  if (user && !['system_owner', 'platform_admin'].includes(user.role)) return <Navigate to='/channels' replace />;
  if (!data) return <div className='p-6'>Loading...</div>;
  const sessions = data?.twitch?.sessions ?? [];
  const transports = data?.twitch?.transports ?? [];
  return <div className='p-6 space-y-3'><h1 className='text-xl font-bold'>Admin Health</h1><div>Backend Status: {data?.backend ?? 'unknown'}</div><div>EventSub enabled: {String(data?.twitch?.eventSubEnabled)}</div><div>Scope moderator:read:chatters: {cfg?.scopes?.broadcaster?.includes('moderator:read:chatters') ? 'configured' : 'missing'}</div><div>Twitch Sessions: {data?.twitch?.sessionsCount ?? 0}</div><div className='flex gap-2'><button className='px-2 py-1 bg-green-600 text-white rounded' disabled={loading} onClick={() => action('/api/admin/twitch/sessions/start-all')}>Start All</button><button className='px-2 py-1 bg-amber-700 text-white rounded' disabled={loading} onClick={() => action('/api/admin/twitch/sessions/stop-all')}>Stop All</button><button className='px-2 py-1 bg-indigo-700 text-white rounded' disabled={loading} onClick={() => action('/api/admin/twitch/eventsub/restart')}>Restart EventSub</button></div>
  <h2 className='font-semibold'>EventSub Transports</h2>
  <table className='w-full text-sm'><thead><tr><th>Key</th><th>Connected</th><th>Session ID Present</th><th>Channels</th><th>Last Welcome</th><th>Last Error</th></tr></thead><tbody>{transports.map((t:any)=><tr key={t.key} className='border-t'><td>{t.key}</td><td>{String(t.connected)}</td><td>{String(t.sessionIdPresent)}</td><td>{(t.channels||[]).join(', ') || '-'}</td><td>{t.lastWelcomeAt || '-'}</td><td>{t.lastError || '-'}</td></tr>)}</tbody></table>
  <h2 className='font-semibold'>Sessions</h2>
  <table className='w-full text-sm'><thead><tr><th>Channel</th><th>Transport</th><th>Status</th><th>Connected</th><th>Subscribed</th><th>Last Message</th><th>Last Error</th><th>Action</th></tr></thead><tbody>{sessions.map((s: any) => { const channel = { id: s.channelId, twitchChannelId: s.twitchChannelId, twitchLogin: s.twitchLogin, displayName: s.displayName }; return <tr key={s.channelId} className='border-t'><td><div>{getChannelDisplayName(channel)}</div>{getChannelHandle(channel) && <div className='text-xs text-zinc-400'>{getChannelHandle(channel)}</div>}{isFallbackChannelName(channel) && <div className='text-xs text-zinc-500'>ID: {truncateId(s.channelId)}</div>}</td><td>{s.transportKey || '-'}</td><td>{s.status}</td><td>{String(s.connected)}</td><td>{String(s.subscribed)}</td><td>{s.lastMessageAt || '-'}</td><td>{s.lastError || '-'}</td><td><button className='px-2 py-1 bg-slate-700 text-white rounded' onClick={() => action(`/api/admin/twitch/sessions/${s.channelId}/restart`)}>Restart Session</button></td></tr>; })}</tbody></table></div>;
}
