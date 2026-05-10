import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPost } from '../api/client';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageHeader from '../components/ui/PageHeader';
import LoadingState from '../components/ui/LoadingState';
import ErrorBox from '../components/ui/ErrorBox';

export default function RecapsPage() {
  const { channelId = '' } = useParams();
  const [range, setRange] = useState('24h');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => { setLoading(true); try { setItems(await apiGet(`/api/channels/${channelId}/recaps`)); setError(''); } catch (e: any) { setError(e?.data?.error ?? 'Fehler'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [channelId]);
  const parse = (v: any) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; } };

  return <div className='space-y-4'>
    <PageHeader title='Recaps' subtitle='Automatisch aus Chatdaten erzeugte Stream-Rückblicke.'/>
    <div className='flex gap-2'><select className='border px-2 py-1' value={range} onChange={(e)=>setRange(e.target.value)}>{['1h','6h','24h','7d'].map((r)=><option key={r}>{r}</option>)}</select><button className='border px-3 py-1' onClick={()=>apiPost(`/api/channels/${channelId}/recaps`, { range }).then(load)}>Recap erzeugen</button></div>
    {loading && <LoadingState label='Recaps werden geladen…'/>}
    {error && <ErrorBox message={error} />}
    {!loading && items.length === 0 && <p className='text-sm text-slate-400'>Noch keine Recaps vorhanden.</p>}
    {items.map((item) => { const h = parse(item.highlightsJson); return <div key={item.id} className='border p-3 space-y-2'>
      <div className='flex items-center justify-between'><h2 className='font-semibold'>{h.title || 'Recap'}</h2><button className='border px-2 py-1' onClick={()=>setDeleteId(item.id)}>Löschen</button></div>
      <p className='text-xs text-slate-400'>{h.range} · {new Date(item.createdAt).toLocaleString()}</p>
      <p>{h.summaryText || item.summary}</p>
      <p className='text-sm'>Nachrichten: {h.stats?.messagesTotal ?? 0} · aktive User: {h.stats?.uniqueUsers ?? 0} · Commands: {h.stats?.commandsTotal ?? 0} · Peak: {h.stats?.peakHour ?? '-'}</p>
      <p className='text-sm'>Top Themen: {(h.topTopics || []).map((t:any)=>`${t.term} (${t.count})`).join(', ') || '—'}</p>
      <p className='text-sm'>Häufige Fragen: {(h.frequentQuestions || []).map((q:any)=>`${q.text} (${q.count})`).join(' | ') || '—'}</p>
      <p className='text-sm'>Top Commands: {(h.topCommands || []).map((c:any)=>`${c.name} (${c.count})`).join(', ') || '—'}</p>
    </div>; })}
    <ConfirmDialog open={!!deleteId} title='Recap löschen?' description='Dieser Recap wird dauerhaft gelöscht.' confirmLabel='Löschen' onCancel={()=>setDeleteId(null)} onConfirm={async()=>{if(!deleteId)return; await apiDelete(`/api/channels/${channelId}/recaps/${deleteId}`); setDeleteId(null); await load();}} />
  </div>;
}
