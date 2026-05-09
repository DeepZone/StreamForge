import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiBase, apiGet } from '../api/client';
import { apiPost } from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import ErrorBox from '../components/ui/ErrorBox';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

const dedupKey = (m: any) => m?.externalMessageId || m?.messageId || m?.id || `${m?.username || ''}|${m?.message || ''}|${m?.createdAt || ''}`;
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
  const [status, setStatus] = useState<'connected'|'reconnecting'|'disconnected'>('disconnected');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [historyLoadedAt, setHistoryLoadedAt] = useState<string | null>(null);
  const [liveSince, setLiveSince] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendInfo, setSendInfo] = useState('');
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const palette = ['#f87171','#fb923c','#facc15','#4ade80','#22d3ee','#60a5fa','#a78bfa','#f472b6'];

  const getViewerNameColor = (seed: string) => {
    if (!seed) return palette[0];
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  };

  const loadHistory = async () => {
    try { const d = await apiGet<{ items: any[] }>(`/api/channels/${channelId}/chat/messages?limit=100`); setItems(dedupMessages(d.items.reverse())); setError(''); setHistoryLoadedAt(new Date().toISOString()); }
    catch { setError('Historie konnte nicht geladen werden.'); }
  };

  useEffect(() => { loadHistory(); apiGet(`/api/channels/${channelId}/twitch/debug`).then(setDebug).catch(() => null); }, [channelId]);

  useEffect(() => {
    let closed = false; let timer: any; let es: EventSource | null = null;
    const connect = () => {
      setStatus((s) => s === 'disconnected' ? 'reconnecting' : s);
      es = new EventSource(`${apiBase}/api/channels/${channelId}/live/chat/stream`, { withCredentials: true });
      es.onopen = () => { setStatus('connected'); setError(''); setLiveSince((x) => x || new Date().toISOString()); };
      es.onmessage = (evt) => {
        const e = JSON.parse(evt.data);
        if (e.type === 'system.keepalive') return;
        setItems((prev) => dedupMessages([...prev, e]).slice(-500));
      };
      es.onerror = () => {
        if (closed) return;
        setStatus('reconnecting');
        setError('Live-Verbindung getrennt, versuche neu zu verbinden.');
        es?.close();
        timer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => { closed = true; setStatus('disconnected'); if (timer) clearTimeout(timer); es?.close(); };
  }, [channelId]);

  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }); }, [items]);
  const filtered = useMemo(() => items.filter((i) => `${i.username} ${i.message}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const draftLength = draft.length;

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || message.length > 500 || sending) return;
    setSending(true); setSendError(''); setSendInfo('');
    try {
      await apiPost(`/api/channels/${channelId}/live/chat/send`, { message });
      setDraft('');
      setSendInfo('Gesendet. Warte auf Twitch-Bestätigung im Chat.');
    } catch (e: any) {
      const code = e?.data?.errorCode;
      if (e?.status === 403) setSendError('Du hast keine Berechtigung, als Streamer in diesen Chat zu schreiben.');
      else if (code === 'twitch.live_chat.scope_missing') setSendError('Bitte Twitch erneut verbinden, damit StreamForge als Streamer schreiben darf. Öffne /api/auth/twitch/start');
      else if (code === 'twitch.live_chat.dropped' && e?.data?.dropReason?.message) setSendError(`Twitch hat die Nachricht abgelehnt: ${e.data.dropReason.message}`);
      else setSendError('Nachricht konnte nicht gesendet werden.');
    } finally { setSending(false); }
  };

  return <div className='space-y-3'>
    <PageHeader title='Live Chat' subtitle='Aktuelle Twitch-Chatnachrichten für diesen Channel.' />
    <div className='flex gap-2 items-center'><input className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Suche…' value={query} onChange={e => setQuery(e.target.value)} /><Button onClick={loadHistory}>Historie neu laden</Button><div className='text-sm text-zinc-400'>SSE: <StatusBadge status={status} /></div></div>
    <div className='text-xs text-zinc-400'>History geladen um {historyLoadedAt ? new Date(historyLoadedAt).toLocaleTimeString() : '-'} · Live-Verbindung aktiv seit {liveSince ? new Date(liveSince).toLocaleTimeString() : '-'} · <Link className='underline' to={`/dashboard/channels/${channelId}/integrations`}>Twitch Debug prüfen</Link></div>{status === 'connected' && debug?.session?.lastMessageAt && Date.now() - new Date(debug.session.lastMessageAt).getTime() > 5 * 60 * 1000 && <div className='text-amber-400 text-sm'>Live-Verbindung zur Plattform steht, aber Twitch liefert aktuell keine neuen Events.</div>}
    {error && <ErrorBox message={error} />}
    <div className='rounded border border-zinc-800 bg-zinc-950 p-3 space-y-2'>
      <textarea className='w-full min-h-[64px] px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Als Streamer schreiben...' value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} />
      <div className='flex items-center justify-between text-xs text-zinc-400'>
        <span>{draftLength}/500</span>
        <Button disabled={sending || draft.trim().length === 0 || draftLength > 500} onClick={sendMessage}>Senden</Button>
      </div>
      {sendInfo && <div className='text-emerald-300 text-sm'>{sendInfo}</div>}
      {sendError && <ErrorBox message={sendError} />}
    </div>
    <div ref={boxRef} className='h-[65vh] overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 space-y-2'>
      {!filtered.length ? <EmptyState title='Keine Nachrichten' description='Noch keine Chatnachrichten sichtbar.' /> : filtered.map((m, i) => {
        const viewerColor = m.userColor || m.color || getViewerNameColor(m.userId || m.username || 'unknown');
        const isStreamer = Boolean(m.isBroadcaster);
        return <div key={`${dedupKey(m)}-${i}`} className='text-sm'><span className='text-zinc-500 mr-2'>{new Date(m.createdAt).toLocaleTimeString()}</span><span style={{ color: viewerColor }}>{m.username}</span>{isStreamer && <span className='ml-2 text-[10px] uppercase tracking-wide text-emerald-300'>Streamer</span>}<span className='mx-2 text-zinc-500'>:</span><span className='text-slate-100'>{m.message}</span></div>;
      })}
    </div>
  </div>;
}
