import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiBase } from '../api/client';

export default function CommunityPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [eventType, setEventType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '100' });
    if (eventType) query.set('eventType', eventType);
    const res = await fetch(`${apiBase}/api/channels/${channelId}/logs?${query.toString()}`, { credentials: 'include' });
    if (!res.ok) throw new Error('load_failed');
    const json = await res.json();
    setItems(json.items ?? []);
    setLoading(false);
  };

  useEffect(() => { load().catch((e) => { setError(e.message); setLoading(false); }); }, [channelId, eventType]);

  return <div className='p-6 space-y-3'>
    <h1 className='text-xl font-bold'>Channel Logs</h1>
    <input className='border px-2 py-1' placeholder='eventType filter' value={eventType} onChange={(e) => setEventType(e.target.value)} />
    {loading && <div>Loading...</div>}
    {error && <div className='text-red-600'>Error: {error}</div>}
    <table className='w-full text-sm'>
      <thead><tr><th>Zeit</th><th>Event Type</th><th>Platform</th><th>Payload</th></tr></thead>
      <tbody>
        {items.map((it) => <tr key={it.id} className='border-t'><td>{it.createdAt}</td><td>{it.eventType}</td><td>{it.platform}</td><td>{String(it.payloadJson).slice(0, 120)}</td></tr>)}
      </tbody>
    </table>
  </div>;
}
