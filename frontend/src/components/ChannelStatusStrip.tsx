import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';

type Status = {
  channelId: string;
  generatedAt: string;
  live: { isLive: boolean; viewerCount: number; title: string | null; gameName: string | null; startedAt: string | null; durationSeconds: number };
  subscribers: { available: boolean; count: number | null; missingScopes: string[] };
  streamHealth: { bitrateKbps: number | null; available: boolean; reason?: string | null };
  eventSub: { enabled: boolean; connected: boolean; subscribed: boolean; lastMessageAt?: string | null; lastError?: string | null };
};

const fmtDuration = (seconds: number) => new Date(seconds * 1000).toISOString().substring(11, 19);

export default function ChannelStatusStrip({ channelId, showSwitchLink = false }: { channelId: string; showSwitchLink?: boolean }) {
  const [data, setData] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      setErr(null);
      setData(await apiGet<Status>(`/api/channels/${channelId}/twitch/status`));
    } catch {
      setErr('Status nicht verfügbar');
    }
  };

  useEffect(() => {
    if (!channelId) return;
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [channelId]);

  const subText = useMemo(() => {
    if (!data) return 'Subs n/a';
    if (data.subscribers.available && data.subscribers.count !== null) return `Subs ${data.subscribers.count}`;
    return 'Subs n/a';
  }, [data]);

  const chatText = data?.eventSub.enabled
    ? data.eventSub.connected && data.eventSub.subscribed
      ? 'Chat OK'
      : data.eventSub.connected
        ? 'Chat reconnecting'
        : 'Chat getrennt'
    : 'Chat aus';

  return <div className='w-full border-b border-zinc-800 bg-zinc-950/90 backdrop-blur'>
    <div className='mx-auto max-w-7xl px-4 py-2'>
      <div className='flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs text-zinc-200'>
        <span className={`rounded-md px-2 py-1 font-semibold ${data?.live.isLive ? 'bg-rose-600/80 text-white' : 'bg-zinc-800 text-zinc-300'}`}>{data?.live.isLive ? 'LIVE' : 'OFFLINE'}</span>
        <span className='rounded-md bg-zinc-900 px-2 py-1'>Zuschauer {data?.live.viewerCount ?? 0}</span>
        <span className='rounded-md bg-zinc-900 px-2 py-1' title={data?.subscribers.missingScopes?.length ? 'Scope fehlt. Twitch erneut verbinden.' : ''}>{subText}</span>
        <span className='max-w-[280px] truncate rounded-md bg-zinc-900 px-2 py-1'>{data?.live.title ?? 'Kein aktiver Stream'}</span>
        <span className='rounded-md bg-zinc-900 px-2 py-1'>{data?.live.gameName ?? '-'}</span>
        <span className='rounded-md bg-zinc-900 px-2 py-1'>{data?.live.isLive ? fmtDuration(data.live.durationSeconds) : '-'}</span>
        <span className='rounded-md bg-zinc-900 px-2 py-1'>{chatText}</span>
        <span className='rounded-md bg-zinc-900 px-2 py-1'>Bitrate: {data?.streamHealth.available && data?.streamHealth.bitrateKbps !== null ? `${data.streamHealth.bitrateKbps} kbps` : 'n/a'}</span>
        <button onClick={() => void load()} className='rounded-md bg-zinc-800 px-2 py-1 hover:bg-zinc-700'>Refresh</button>
        {showSwitchLink && <Link to='/channels' className='ml-1 text-zinc-400 hover:text-zinc-100'>Channel wechseln</Link>}
        {err && <span className='text-amber-400'>{err}</span>}
      </div>
    </div>
  </div>;
}
