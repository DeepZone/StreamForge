import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';

export default function RecapsPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const list = await apiGet<any[]>(`/api/channels/${channelId}/recaps`);
      setItems(list); setSelected(list[0] ?? null);
    } catch (e: any) { setError(e?.data?.error ?? 'Recaps konnten nicht geladen werden.'); }
    finally { setLoading(false); }
  };

  const generate = async () => {
    await apiPost(`/api/channels/${channelId}/recaps/generate`, {});
    await load();
  };

  useEffect(() => { void load(); }, [channelId]);

  return <div className='space-y-4'>
    <h1 className='text-xl font-bold'>Recaps</h1>
    <button className='border px-3 py-1' onClick={() => void generate()}>Recap generieren</button>
    {loading ? <p>Lade…</p> : null}
    {error ? <p className='rounded border border-red-700 bg-red-950 p-2 text-red-300'>{error}</p> : null}
    {items.length === 0 ? <p>Noch keine Recaps vorhanden.</p> : <div className='flex gap-4'>
      <div className='w-1/3'>{items.map((r) => <div key={r.id} className='border p-2 my-1 cursor-pointer' onClick={() => setSelected(r)}>{new Date(r.createdAt).toLocaleString()}</div>)}</div>
      <div className='w-2/3'>{selected && <div className='space-y-2'>
        <div><b>Summary:</b> {selected.summary || '—'}</div>
        {['highlightsJson', 'frequentQuestionsJson', 'suggestedCommandsJson', 'recommendationsJson', 'engagementJson'].map((key) => <div key={key}><h3 className='font-semibold'>{key}</h3><pre className='bg-slate-900 border border-slate-700 p-2 text-xs overflow-auto'>{typeof selected[key] === 'string' ? selected[key] : JSON.stringify(selected[key], null, 2)}</pre></div>)}
      </div>}</div>
    </div>}
  </div>;
}
