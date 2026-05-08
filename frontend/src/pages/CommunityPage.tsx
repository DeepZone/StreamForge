import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiBase } from '../api/client';

const ranges = { '24h': 1, '7d': 7, '30d': 30 } as const;

export default function CommunityPage() {
  const { channelId = '' } = useParams();
  const [rangeKey, setRangeKey] = useState<keyof typeof ranges>('7d');
  const [radar, setRadar] = useState<any>(null);
  const [faq, setFaq] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const query = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - ranges[rangeKey] * 24 * 60 * 60 * 1000);
    return new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), limit: '20' }).toString();
  }, [rangeKey]);

  const load = async () => {
    const [r1, r2, r3] = await Promise.all([
      fetch(`${apiBase}/api/channels/${channelId}/community/radar?${query}`, { credentials: 'include' }),
      fetch(`${apiBase}/api/channels/${channelId}/community/faq?${query}`, { credentials: 'include' }),
      fetch(`${apiBase}/api/channels/${channelId}/commands/suggestions?${query}`, { credentials: 'include' })
    ]);
    setRadar(await r1.json()); setFaq(await r2.json()); setSuggestions(await r3.json());
  };

  const createCommand = async (s: any) => {
    await fetch(`${apiBase}/api/channels/${channelId}/commands/from-suggestion`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: s.suggestedName, response: s.suggestedResponse, sourceQuestion: s.sourceQuestion }) });
    load();
  };

  useEffect(() => { load(); }, [channelId, query]);
  if (!radar) return <div className='p-6'>Loading...</div>;
  return <div className='p-6 space-y-4'>
    <h1 className='text-xl font-bold'>Community Radar</h1>
    <select className='border px-2 py-1' value={rangeKey} onChange={(e) => setRangeKey(e.target.value as any)}>{Object.keys(ranges).map((k) => <option key={k} value={k}>{k}</option>)}</select>
    <div className='grid grid-cols-2 md:grid-cols-5 gap-2'>{Object.entries(radar.summary).map(([k, v]) => <div key={k} className='border p-2'><div className='text-xs'>{k}</div><div className='font-bold'>{String(v)}</div></div>)}</div>
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
  return <div><h2 className='font-semibold'>{title}</h2><pre className='bg-slate-50 p-2 overflow-auto text-xs'>{JSON.stringify(rows, null, 2)}</pre></div>;
}
