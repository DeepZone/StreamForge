import { useEffect, useState } from 'react';
import { apiBase } from '../../api/client';

export default function AdminHealth() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const res = await fetch(`${apiBase}/api/admin/health`, { credentials: 'include' });
    const json = await res.json();
    setData(json);
  };

  const action = async (path: string) => {
    setLoading(true);
    await fetch(`${apiBase}${path}`, { method: 'POST', credentials: 'include' });
    await load();
    setLoading(false);
  };

  useEffect(() => { load().catch(() => setData({ error: true })); }, []);
  if (!data) return <div className='p-6'>Loading...</div>;
  const sessions = data?.twitch?.sessions ?? [];

  return <div className='p-6 space-y-3'>
    <h1 className='text-xl font-bold'>Admin Health</h1>
    <div>EventSub enabled: {String(data?.twitch?.eventSubEnabled)}</div>
    <div>Sessions: {data?.twitch?.sessionsCount ?? 0}</div>
    <div className='flex gap-2'>
      <button className='px-2 py-1 bg-green-600 text-white rounded' disabled={loading} onClick={() => action('/api/admin/twitch/sessions/start-all')}>Start All</button>
      <button className='px-2 py-1 bg-amber-700 text-white rounded' disabled={loading} onClick={() => action('/api/admin/twitch/sessions/stop-all')}>Stop All</button>
    </div>
    <table className='w-full text-sm'>
      <thead><tr><th>Channel</th><th>Status</th><th>Connected</th><th>Subscribed</th><th>Last Message</th><th>Last Error</th><th>Reconnects</th><th>Action</th></tr></thead>
      <tbody>
        {sessions.map((s: any) => <tr key={s.channelId} className='border-t'>
          <td>{s.twitchLogin || s.channelId}</td><td>{s.status}</td><td>{String(s.connected)}</td><td>{String(s.subscribed)}</td><td>{s.lastMessageAt || '-'}</td><td>{s.lastError || '-'}</td><td>{s.reconnectCount}</td>
          <td><button className='px-2 py-1 bg-slate-700 text-white rounded' onClick={() => action(`/api/admin/twitch/sessions/${s.channelId}/restart`)}>Restart</button></td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
