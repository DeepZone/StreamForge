import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPost } from '../api/client';

export default function RecapsPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<any[]>([]); const [selected, setSelected] = useState<any>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const list = await apiGet<any[]>(`/api/channels/${channelId}/recaps`); setItems(list); setSelected(list[0] ?? null); setError(''); } catch(e:any){ setError(e?.data?.error ?? 'Fehler'); } finally { setLoading(false); } };
  useEffect(()=>{ void load(); }, [channelId]);
  const parse = (v: any) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
  return <div className='space-y-4'><h1 className='text-xl font-bold'>Recaps</h1><button className='border px-3 py-1' onClick={()=>apiPost(`/api/channels/${channelId}/recaps/generate`,{}).then(load)}>Recap generieren</button>{loading && <p>Lade…</p>}{error && <p className='text-red-300'>{error}</p>}
  {items.length===0 ? <p>Keine Recaps vorhanden.</p> : <div className='grid md:grid-cols-3 gap-4'><div>{items.map((x)=><div key={x.id} className='border p-2 my-1 flex justify-between gap-2'><button className='text-left flex-1' onClick={()=>setSelected(x)}>{new Date(x.createdAt).toLocaleString()}</button><button className='border px-2' onClick={()=>{if(confirm('Recap löschen?')) apiDelete(`/api/channels/${channelId}/recaps/${x.id}`).then(load);}}>Löschen</button></div>)}</div><div className='md:col-span-2'>{selected && <RecapDetail recap={selected} parse={parse} />}</div></div>}</div>;
}
function RecapDetail({ recap, parse }: any){ const h=parse(recap.highlightsJson)||{}; const f=parse(recap.frequentQuestionsJson)||[]; const s=parse(recap.suggestedCommandsJson)||[]; const r=parse(recap.recommendationsJson)||[]; const e=parse(recap.engagementJson)||{}; return <div className='space-y-2'><p><b>Summary:</b> {recap.summary}</p><Block title='Highlights' items={[...(h.topTopics||[]).map((t:any)=>`${t.topic} (${t.count})`)]}/><Block title='Häufige Fragen' items={f.map((x:any)=>`${x.question} (${x.count})`)}/><Block title='Command-Vorschläge' items={s.map((x:any)=>`!${x.suggestedName} (${x.count})`)}/><Block title='Empfehlungen' items={r}/><Block title='Engagement-Daten' items={[`Score: ${e.engagementScore ?? '-'}`,`Nachrichten: ${e.totalMessages ?? '-'}`,`Aktive Chatter: ${e.uniqueChatters ?? '-'}`]} /></div>; }
function Block({ title, items }: { title: string; items: any[] }) { return <div><h3 className='font-semibold'>{title}</h3>{items?.length ? items.map((x,i)=><div key={i} className='border p-2 my-1'>{String(x)}</div>) : <p className='text-sm text-slate-400'>Keine Daten.</p>}</div>; }
