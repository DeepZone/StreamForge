import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiBase, apiGet, apiPost } from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import ErrorBox from '../components/ui/ErrorBox';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

const dedupKey = (m: any) => m?.externalMessageId || m?.messageId || m?.id || `${m?.username || ''}|${m?.message || ''}|${m?.createdAt || ''}`;
const viewerNameColors = [
  '#f87171',
  '#fb923c',
  '#facc15',
  '#4ade80',
  '#34d399',
  '#22d3ee',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#f472b6',
  '#fb7185'
];
const isValidHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const getStableColor = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return viewerNameColors[Math.abs(hash) % viewerNameColors.length];
};
const getViewerNameColor = (message: any): string => {
  if (isValidHexColor(message?.color)) return message.color;
  if (isValidHexColor(message?.userColor)) return message.userColor;
  if (isValidHexColor(message?.chatterColor)) return message.chatterColor;
  return getStableColor(message?.twitchUserId || message?.username || message?.displayName || 'unknown');
};
const dedupMessages = (messages: any[]) => {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const m of messages) {
    const key = dedupKey(m);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
};

export default function LiveChatPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState<'connecting'|'connected'|'reconnecting'|'disconnected'>('connecting');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [historyLoadedAt, setHistoryLoadedAt] = useState<string | null>(null);
  const [liveConnectedAt, setLiveConnectedAt] = useState<string | null>(null);
  const [lastPingAt, setLastPingAt] = useState<string | null>(null);
  const [lastLiveEventAt, setLastLiveEventAt] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendInfo, setSendInfo] = useState('');
  const [sending, setSending] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadHistory = async () => {
    try {
      const d = await apiGet<{ items: any[] }>(`/api/channels/${channelId}/chat/messages?limit=100`);
      setItems((prev) => dedupMessages([...prev, ...d.items.reverse()]));
      setError('');
      setHistoryLoadedAt(new Date().toISOString());
    } catch { setError('Historie konnte nicht geladen werden.'); }
  };
  const loadDebug = async () => { try { setDebug(await apiGet(`/api/channels/${channelId}/twitch/debug`)); } catch {} };

  useEffect(() => { void loadHistory(); void loadDebug(); }, [channelId]);

  useEffect(() => {
    setStatus('connecting');
    if (eventSourceRef.current) eventSourceRef.current.close();
    const es = new EventSource(`${apiBase}/api/channels/${channelId}/live/chat/stream`, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => { setStatus('connected'); setError(''); setLiveConnectedAt((x) => x || new Date().toISOString()); };
    es.addEventListener('system.connected', () => setStatus('connected'));
    es.addEventListener('ping', (evt: MessageEvent) => {
      const p = JSON.parse(evt.data || '{}');
      setLastPingAt(p.createdAt || new Date().toISOString());
    });
    es.addEventListener('chat.message', (evt: MessageEvent) => {
      const payload = JSON.parse(evt.data || '{}');
      const message = payload?.message ?? payload;
      setLastLiveEventAt(new Date().toISOString());
      setItems((prev) => dedupMessages([...prev, message]).slice(-500));
    });
    es.onerror = () => { setStatus('reconnecting'); };

    return () => {
      es.close();
      if (eventSourceRef.current === es) eventSourceRef.current = null;
      setStatus('disconnected');
    };
  }, [channelId]);

  useEffect(() => { if (autoScroll) boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }); }, [items, autoScroll]);

  const filtered = useMemo(() => items.filter((i) => `${i.username} ${i.message}`.toLowerCase().includes(query.toLowerCase())), [items, query]);

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || message.length > 500 || sending) return;
    setSending(true); setSendError(''); setSendInfo('');
    try {
      await apiPost(`/api/channels/${channelId}/live/chat/send`, { message });
      setDraft('');
      setSendInfo('Gesendet. Warte auf Twitch EventSub...');
    } catch { setSendError('Nachricht konnte nicht gesendet werden.'); } finally { setSending(false); }
  };

  return <div className='space-y-3'>
    <PageHeader title='Live Chat' subtitle='Aktuelle Twitch-Chatnachrichten für diesen Channel.' />
    <div className='flex gap-2 items-center'>
      <input className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Suche…' value={query} onChange={e => setQuery(e.target.value)} />
      <Button onClick={loadHistory}>Historie neu laden</Button>
      <Button onClick={loadDebug}>Debug prüfen</Button>
      <label className='text-sm text-zinc-300'><input type='checkbox' checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className='mr-2' />Auto-scroll</label>
      <div className='text-sm text-zinc-400'>SSE: <StatusBadge status={status} /></div>
    </div>
    <div className='text-xs text-zinc-400'>History: {historyLoadedAt ? new Date(historyLoadedAt).toLocaleTimeString() : '-'} · Verbunden seit: {liveConnectedAt ? new Date(liveConnectedAt).toLocaleTimeString() : '-'} · Letzter Ping: {lastPingAt ? new Date(lastPingAt).toLocaleTimeString() : '-'} · Letztes Live-Event: {lastLiveEventAt ? new Date(lastLiveEventAt).toLocaleTimeString() : '-'}</div>
    <div className='text-xs text-zinc-400'>eventSub.subscribed: {String(Boolean(debug?.session?.subscribed))} · session.lastMessageAt: {debug?.session?.lastMessageAt ?? '-'} · liveStream.subscribers: {debug?.liveStream?.subscribers ?? 0} · liveStream.lastPublishedAt: {debug?.liveStream?.lastPublishedAt ?? '-'}</div>
    {error && <ErrorBox message={error} />}
    <div className='rounded border border-zinc-800 bg-zinc-950 p-3 space-y-2'>
      <textarea className='w-full min-h-[64px] px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Als Streamer schreiben...' value={draft} onChange={e => setDraft(e.target.value)} />
      <Button disabled={sending || draft.trim().length === 0} onClick={sendMessage}>Senden</Button>
      {sendInfo && <div className='text-emerald-300 text-sm'>{sendInfo}</div>}
      {sendError && <ErrorBox message={sendError} />}
    </div>
    <div ref={boxRef} className='h-[65vh] overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 space-y-2'>
      {!filtered.length ? <EmptyState title='Keine Nachrichten' description='Noch keine Chatnachrichten sichtbar.' /> : filtered.map((m, i) => {
        const nameColor = getViewerNameColor(m);
        const displayName = m.displayName || m.username || 'unknown';
        return <div key={`${dedupKey(m)}-${i}`} className='text-sm'>
          <span className='text-zinc-500 mr-2'>{new Date(m.createdAt).toLocaleTimeString()}</span>
          <span style={{ color: nameColor }}>{displayName}</span>
          <span className='mx-2 text-zinc-500'>:</span>
          <span className='text-slate-100'>{m.message}</span>
        </div>;
      })}
    </div>
  </div>;
}
