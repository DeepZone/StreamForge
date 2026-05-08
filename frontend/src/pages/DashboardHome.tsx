import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../api/client';

type Command = { id: string };
type Timer = { id: string };
type Recap = { id: string; createdAt: string };
type Radar = { summary?: Record<string, unknown> };

export default function DashboardHome() {
  const { channelId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ commandCount: 0, timerCount: 0, lastCommunityActivity: 'Noch keine Daten', lastRecap: 'Noch keine Daten' });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [commands, timers, recaps, radar] = await Promise.allSettled([
          apiGet<Command[]>(`/api/channels/${channelId}/commands`),
          apiGet<Timer[]>(`/api/channels/${channelId}/timers`),
          apiGet<Recap[]>(`/api/channels/${channelId}/recaps`),
          apiGet<Radar>(`/api/channels/${channelId}/community/radar`)
        ]);

        setStats({
          commandCount: commands.status === 'fulfilled' ? commands.value.length : 0,
          timerCount: timers.status === 'fulfilled' ? timers.value.length : 0,
          lastRecap: recaps.status === 'fulfilled' && recaps.value[0] ? new Date(recaps.value[0].createdAt).toLocaleString() : 'Noch keine Daten',
          lastCommunityActivity: radar.status === 'fulfilled' && radar.value?.summary ? JSON.stringify(radar.value.summary) : 'Noch keine Daten'
        });
      } catch {
        setError('Übersicht konnte nicht vollständig geladen werden.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [channelId]);

  const quickLinks = [
    ['Commands', 'commands'],
    ['Timers', 'timers'],
    ['Community Radar', 'community'],
    ['Recaps', 'recaps']
  ];

  return <div className='space-y-4'>
    <h1 className='text-2xl font-semibold'>Dashboard Übersicht</h1>
    <p className='text-slate-300'>Channel ID: <span className='font-mono'>{channelId}</span></p>
    {loading ? <p>Lade Übersicht…</p> : null}
    {error ? <p className='rounded border border-red-700 bg-red-950 p-3 text-red-300'>{error}</p> : null}
    <div className='grid md:grid-cols-2 gap-3'>
      <div className='rounded border border-slate-800 p-3'>Commands: {stats.commandCount}</div>
      <div className='rounded border border-slate-800 p-3'>Timers: {stats.timerCount}</div>
      <div className='rounded border border-slate-800 p-3'>Letzte Community-Aktivität: {stats.lastCommunityActivity}</div>
      <div className='rounded border border-slate-800 p-3'>Letzter Recap: {stats.lastRecap}</div>
    </div>
    <div className='flex gap-2 flex-wrap'>
      {quickLinks.map(([label, segment]) => <Link key={segment} className='rounded bg-slate-800 px-3 py-2 text-sm' to={`/dashboard/channels/${channelId}/${segment}`}>{label}</Link>)}
    </div>
  </div>;
}
