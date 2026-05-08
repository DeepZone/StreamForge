import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiPost, apiGet } from '../api/client';

const ranges = { '24h': 1, '7d': 7, '30d': 30 } as const;

export default function CommunityPage() {
  const { channelId = '' } = useParams();
  const [rangeKey, setRangeKey] = useState<keyof typeof ranges>('7d');
  const [radar, setRadar] = useState<any>(null);
  const [faq, setFaq] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - ranges[rangeKey] * 24 * 60 * 60 * 1000);
    return new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), limit: '20' }).toString();
  }, [rangeKey]);

  const load = async () => {
    setError('');
    try {
      const [a, b, c] = await Promise.all([
        apiGet(`/api/channels/${channelId}/community/radar?${query}`),
        apiGet(`/api/channels/${channelId}/community/faq?${query}`),
        apiGet(`/api/channels/${channelId}/commands/suggestions?${query}`)
      ]);
      setRadar(a); setFaq(Array.isArray(b) ? b : []); setSuggestions(Array.isArray(c) ? c : []);
    } catch (e: any) { setError(e?.data?.error ?? 'Community Radar konnte nicht geladen werden.'); }
  };

  const createCommand = async (s: any) => {
    await apiPost(`/api/channels/${channelId}/commands/from-suggestion`, { name: s.suggestedName, response: s.suggestedResponse, sourceQuestion: s.sourceQuestion });
    load();
  };

  useEffect(() => { load(); }, [channelId, query]);
  if (!radar) return <div className='p-6'>Loading...</div>;
  return <div className='space-y-4'>
    <h1 className='text-xl font-bold'>Community Radar</h1>
    <select className='border px-2 py-1' value={rangeKey} onChange={(e) => setRangeKey(e.target.value as any)}>{Object.keys(ranges).map((k) => <option key={k} value={k}>{k}</option>)}</select>
    {error ? <p className='rounded border border-red-700 bg-red-950 p-2 text-red-300'>{error}</p> : null}
    <div className='grid grid-cols-2 md:grid-cols-5 gap-2'>{Object.entries(radar.summary || {}).map(([k, v]) => <div key={k} className='border p-2'><div className='text-xs'>{k}</div><div className='font-bold'>{String(v)}</div></div>)}</div>
    <Section title='Top Chatter' rows={radar.topChatters} />
    <Section title='Neue Zuschauer' rows={radar.newViewers} />
    <Section title='Wiederkehrende Zuschauer' rows={radar.returningViewers} />
    <Section title='Potenzielle Mods (Hinweis)' rows={radar.potentialModerators} />
    <Section title='Watchlist zur manuellen Prüfung' rows={radar.watchlist} />
    <Section title='FAQ' rows={faq} />
    <div><h2 className='font-semibold'>Command-Vorschläge</h2>{suggestions.map((s, i) => <div key={i} className='border p-2 my-1 flex justify-between'><div><div>{s.sourceQuestion} ({s.count})</div><div>!{s.suggestedName} {s.alreadyExists ? '(existiert bereits)' : ''}</div></div>{!s.alreadyExists && <button className='border px-2' onClick={() => createCommand(s)}>Command erstellen</button>}</div>)}</div>
  </div>;
}

function Section({ title, rows }: { title: string; rows: any[] }) {
  if (!rows?.length) return <div><h2 className='font-semibold'>{title}</h2><p className='text-slate-400 text-sm'>Noch keine Daten.</p></div>;
  return <div><h2 className='font-semibold'>{title}</h2><pre className='bg-slate-900 border border-slate-700 p-2 overflow-auto text-xs'>{JSON.stringify(rows, null, 2)}</pre></div>;
}
