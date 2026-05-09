import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';

export default function AdminHealth() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => setData(await apiGet('/api/admin/health'));
  const action = async (path: string) => { setLoading(true); await apiPost(path); await load(); setLoading(false); };
  useEffect(() => { load().catch(() => setData({ error: true })); apiGet('/api/admin/twitch/config').then(setCfg).catch(()=>null); }, []);
  if (user && !['system_owner','platform_admin'].includes(user.role)) return <Navigate to='/channels' replace />;
  if (!data) return <div className='p-6'>Loading...</div>;
  const sessions = data?.twitch?.sessions ?? [];
  return <div className='p-6 space-y-3'><h1 className='text-xl font-bold'>Admin Health</h1><div>Backend Status: {data?.backend ?? 'unknown'}</div><div>EventSub enabled: {String(data?.twitch?.eventSubEnabled)}</div><div>Scope moderator:read:chatters: {cfg?.scopes?.broadcaster?.includes('moderator:read:chatters') ? 'configured' : 'missing'} {!cfg?.scopes?.broadcaster?.includes('moderator:read:chatters') && <span className='text-amber-400'>· Twitch erneut verbinden</span>}</div><div>Twitch Sessions: {data?.twitch?.sessionsCount ?? 0}</div><div>Timer Worker: {data?.timerWorker?.active ? 'active' : 'inactive'} {data?.timerWorker?.lastRunAt ? `(last run ${new Date(data.timerWorker.lastRunAt).toLocaleString()})` : ''}</div><div className='flex gap-2'><button className='px-2 py-1 bg-green-600 text-white rounded' disabled={loading} onClick={() => action('/api/admin/twitch/sessions/start-all')}>Start All</button><button className='px-2 py-1 bg-amber-700 text-white rounded' disabled={loading} onClick={() => action('/api/admin/twitch/sessions/stop-all')}>Stop All</button></div><table className='w-full text-sm'><thead><tr><th>Channel</th><th>Status</th><th>Connected</th><th>Subscribed</th><th>Subscriptions</th><th>Last Message</th><th>Last Error</th><th>Reconnects</th><th>Action</th></tr></thead><tbody>{sessions.map((s: any) => <tr key={s.channelId} className='border-t'><td>{s.twitchLogin || s.channelId}</td><td>{s.status}</td><td>{String(s.connected)}</td><td>{String(s.subscribed)}</td><td>{s.subscriptionsCount ?? 0}</td><td>{s.lastMessageAt || '-'}</td><td>{s.lastError || '-'}</td><td>{s.reconnectCount}</td><td><button className='px-2 py-1 bg-slate-700 text-white rounded' onClick={() => action(`/api/admin/twitch/sessions/${s.channelId}/restart`)}>Restart</button></td></tr>)}</tbody></table></div>;
}
