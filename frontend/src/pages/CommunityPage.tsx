import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';

const ranges = { '24h': 1, '7d': 7, '30d': 30 } as const;
export default function CommunityPage() {
  const { channelId = '' } = useParams();
  const [rangeKey, setRangeKey] = useState<keyof typeof ranges>('7d');
  const [radar, setRadar] = useState<any>(null); const [faq, setFaq] = useState<any[]>([]); const [suggestions, setSuggestions] = useState<any[]>([]); const [error, setError] = useState('');
  const query = useMemo(() => { const to = new Date(); const from = new Date(to.getTime() - ranges[rangeKey] * 86400000); return new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), limit: '20' }).toString(); }, [rangeKey]);
  const load = async () => { try { setError(''); const [a,b,c] = await Promise.all([apiGet(`/api/channels/${channelId}/community/radar?${query}`), apiGet(`/api/channels/${channelId}/community/faq?${query}`), apiGet(`/api/channels/${channelId}/commands/suggestions?${query}`)]); setRadar(a); setFaq(Array.isArray(b) ? b : []); setSuggestions(Array.isArray(c) ? c : []);} catch(e:any){setError(e?.data?.error ?? 'Fehler');} };
  useEffect(() => { void load(); }, [channelId, query]);
  if (!radar) return <div className='p-6'>Loading…</div>;
  return <div className='space-y-4'>
    <h1 className='text-xl font-bold'>Community Radar</h1>
    <select className='border px-2 py-1' value={rangeKey} onChange={(e)=>setRangeKey(e.target.value as any)}>{Object.keys(ranges).map((k)=><option key={k}>{k}</option>)}</select>
    {error && <p className='rounded border border-red-700 bg-red-950 p-2 text-red-300'>{error}</p>}
    <div className='grid md:grid-cols-3 gap-2'>{Object.entries(radar.summary || {}).map(([k,v]) => <div className='border p-2' key={k}><div className='text-xs text-slate-300'>{k}</div><div className='text-lg font-semibold'>{String(v)}</div></div>)}</div>
    <List title='Top Topics' rows={radar.topTopics} render={(x:any)=><span>{x.topic} ({x.count})</span>} />
    <List title='Top Chatter' rows={radar.topChatters} render={(x:any)=><span>{x.displayName || x.username} · Nachrichten {x.messageCount}</span>} />
    <List title='Neue Zuschauer' rows={radar.newViewers} render={(x:any)=><span>{x.username}</span>} />
    <List title='Wiederkehrende Zuschauer' rows={radar.returningViewers} render={(x:any)=><span>{x.username} · Nachrichten {x.messageCount}</span>} />
    <List title='Watchlist (nur manuelle Prüfung)' rows={radar.watchlist} render={(x:any)=><span>{x.username} · {x.reason}</span>} />
    <div><h2 className='font-semibold'>FAQ</h2>{faq.length===0?<p className='text-sm text-slate-400'>Keine Daten.</p>:faq.map((f,i)=><div key={i} className='border p-2 my-1'>{f.question} <b>({f.count})</b></div>)}</div>
    <div><h2 className='font-semibold'>Command-Vorschläge</h2>{suggestions.length===0?<p className='text-sm text-slate-400'>Keine Vorschläge.</p>:suggestions.map((s,i)=><div key={i} className='border p-2 my-1 flex items-center justify-between'><div><div>{s.sourceQuestion}</div><div className='text-sm text-slate-300'>!{s.suggestedName} {s.alreadyExists?'(existiert bereits)':''}</div></div>{!s.alreadyExists && <button className='border px-2 py-1' onClick={()=>apiPost(`/api/channels/${channelId}/commands/from-suggestion`,{name:s.suggestedName,response:s.suggestedResponse,sourceQuestion:s.sourceQuestion}).then(load)}>Command erstellen</button>}</div>)}</div>
  </div>;
}
function List({ title, rows, render }: { title: string; rows: any[]; render: (x: any) => React.ReactNode }) { return <div><h2 className='font-semibold'>{title}</h2>{!rows?.length ? <p className='text-sm text-slate-400'>Keine Daten.</p> : rows.map((row, i) => <div key={i} className='border p-2 my-1'>{render(row)}</div>)}</div>; }
