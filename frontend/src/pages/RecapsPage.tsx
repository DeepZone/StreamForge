import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiBase } from '../api/client';

export default function RecapsPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  const load = async () => {
    const res = await fetch(`${apiBase}/api/channels/${channelId}/recaps`, { credentials: 'include' });
    const list = await res.json();
    setItems(list);
    if (list[0]) setSelected(list[0]);
  };

  const generate = async () => {
    await fetch(`${apiBase}/api/channels/${channelId}/recaps/generate`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    load();
  };

  useEffect(() => { load(); }, [channelId]);

  return <div className='p-6 space-y-4'>
    <h1 className='text-xl font-bold'>Recaps</h1>
    <button className='border px-3 py-1' onClick={generate}>Recap generieren</button>
    <div className='flex gap-4'>
      <div className='w-1/3'>{items.map((r) => <div key={r.id} className='border p-2 my-1 cursor-pointer' onClick={() => setSelected(r)}>{r.createdAt}</div>)}</div>
      <div className='w-2/3'>{selected && <div className='space-y-2'>
        <div><b>Summary:</b> {selected.summary}</div>
        {['highlightsJson','frequentQuestionsJson','suggestedCommandsJson','recommendationsJson','engagementJson'].map((key) => <div key={key}><h3 className='font-semibold'>{key}</h3><pre className='bg-slate-50 p-2 text-xs'>{selected[key]}</pre></div>)}
      </div>}</div>
    </div>
  </div>;
}
