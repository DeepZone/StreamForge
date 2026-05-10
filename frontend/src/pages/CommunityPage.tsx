import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import LoadingState from '../components/ui/LoadingState';
import ErrorBox from '../components/ui/ErrorBox';

type Range = '1h' | '6h' | '24h' | '7d';

export default function CommunityPage() {
  const { channelId = '' } = useParams();
  const [range, setRange] = useState<Range>('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try { setData(await apiGet(`/api/channels/${channelId}/community/radar?range=${range}`)); setError(''); }
    catch (e: any) { setError(e?.data?.error ?? 'Fehler beim Laden'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [channelId, range]);

  const empty = !loading && (data?.activity?.messagesTotal ?? 0) === 0;
  return <div className='space-y-4'>
    <PageHeader title='Community Radar' subtitle='Aktivität, Themen und wiederkehrende Fragen aus deinem Chat.'/>
    <div className='flex gap-2'><select className='border px-2 py-1' value={range} onChange={(e) => setRange(e.target.value as Range)}>{['1h','6h','24h','7d'].map((r)=><option key={r}>{r}</option>)}</select><button className='border px-3 py-1' onClick={()=>void load()}>Aktualisieren</button></div>
    {loading && <LoadingState label='Radar wird geladen…'/>}
    {error && <ErrorBox message={error} />}
    {empty && <p className='text-sm text-slate-400'>Noch nicht genug Chatdaten für relevante Themen.</p>}
    {data && !empty && <>
      <div className='grid md:grid-cols-4 gap-2'>{[['Nachrichten',data.activity.messagesTotal],['aktive User',data.activity.uniqueUsers],['Commands',data.activity.commandsTotal],['Peak-Stunde',data.activity.peakHour]].map(([k,v])=><div className='border p-2' key={String(k)}><div className='text-xs'>{k}</div><div className='font-semibold'>{String(v)}</div></div>)}</div>
      <SimpleList title='Nachrichten pro Stunde' rows={data.activity.perHour} render={(x:any)=><span>{x.hour} · {x.messages}</span>} />
      <SimpleList title='Aktive Zuschauer' rows={data.activeViewers?.slice(0,10)} render={(x:any)=><span>{x.displayName||x.username} · M {x.messageCount} · C {x.commandCount} · Last {new Date(x.lastSeenAt).toLocaleString()}</span>} />
      <SimpleList title='Neue aktive Zuschauer' rows={data.newActiveUsers} render={(x:any)=><span>{x.displayName||x.username} · M {x.messageCount} · First {new Date(x.firstSeenAt).toLocaleString()}</span>} />
      <SimpleList title='Häufige Fragen' rows={data.frequentQuestions} empty='Noch keine wiederkehrenden Fragen erkannt.' render={(x:any)=><div><div>{x.text} ({x.count} / {x.users} User)</div><div className='text-xs text-slate-400'>{(x.examples||[]).join(' | ')}</div></div>} />
      <div><h2 className='font-semibold'>Relevante Themen</h2><div className='flex flex-wrap gap-2'>{(data.topics||[]).slice(0,20).map((t:any)=><span className='border px-2 py-1 text-sm' key={t.term}>{t.term} ({t.count})</span>)}</div>{!data.topics?.length&&<p className='text-sm text-slate-400'>Noch nicht genug Chatdaten für relevante Themen.</p>}</div>
      <SimpleList title='Commands' rows={data.commands} render={(x:any)=><span>{x.name} · {x.count}</span>} />
    </>}
  </div>;
}

function SimpleList({ title, rows, render, empty = 'Keine Daten.' }: any) { return <div><h2 className='font-semibold'>{title}</h2>{rows?.length ? rows.map((r:any,i:number)=><div className='border p-2 my-1' key={i}>{render(r)}</div>) : <p className='text-sm text-slate-400'>{empty}</p>}</div>; }
