import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiBase, apiGet, apiPost } from '../api/client';
import PageHeader from '../components/ui/PageHeader';

const MOD_ACTIONS = [
  { key: 'timeout', label: 'Timeout' },
  { key: 'ban', label: 'Ban' },
  { key: 'unban', label: 'Unban / Untimeout' }
] as const;

const TIMEOUT_OPTIONS = [
  { label: '60 Sekunden', value: 60 },
  { label: '5 Minuten', value: 300 },
  { label: '10 Minuten', value: 600 },
  { label: '1 Stunde', value: 3600 },
  { label: '24 Stunden', value: 86400 }
];

export default function LiveChatPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedAction, setSelectedAction] = useState<'timeout' | 'ban' | 'unban' | null>(null);
  const [duration, setDuration] = useState<number>(300);
  const [reason, setReason] = useState('');
  const [modLoading, setModLoading] = useState(false);
  const [modMessage, setModMessage] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<{ items: any[] }>(`/api/channels/${channelId}/chat/messages?limit=100`)
      .then((d) => setItems(d.items.reverse()))
      .catch(() => setError('Historie konnte nicht geladen werden.'));
  }, [channelId]);

  useEffect(() => {
    let closed = false;
    let es: EventSource | null = null;
    let timer: any;
    const connect = () => {
      es = new EventSource(`${apiBase}/api/channels/${channelId}/live/chat/stream`, { withCredentials: true });
      es.onmessage = (evt) => {
        const e = JSON.parse(evt.data);
        if (e.type === 'system.keepalive') return;
        setItems((prev) => [...prev, e].slice(-500));
        setError('');
      };
      es.onerror = () => {
        if (closed) return;
        setError('Live Chat Verbindung unterbrochen');
        es?.close();
        timer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [channelId]);

  useEffect(() => {
    if (paused) return;
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [items, paused]);

  useEffect(() => {
    const closeMenu = () => setSelectedUser(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const filtered = useMemo(() => items.filter((i) => `${i.username} ${i.message}`.toLowerCase().includes(query.toLowerCase())), [items, query]);

  const runModeration = async () => {
    if (!selectedUser || !selectedAction) return;
    if (!selectedUser.userExternalId) {
      setModMessage('Keine Twitch User ID für diese Nachricht verfügbar.');
      return;
    }
    setModLoading(true);
    setModMessage('');
    try {
      const body: any = { userId: selectedUser.userExternalId, username: selectedUser.username || undefined, reason: reason || undefined };
      if (selectedAction === 'timeout') body.durationSeconds = duration;
      await apiPost(`/api/channels/${channelId}/moderation/${selectedAction}`, body);
      setModMessage('Moderationsaktion erfolgreich ausgeführt.');
    } catch (e: any) {
      setModMessage(e?.data?.errorCode || 'Moderationsaktion fehlgeschlagen.');
    } finally {
      setModLoading(false);
    }
  };

  return <div className='space-y-3'>
    <PageHeader title='Live Chat' subtitle='Aktuelle Twitch-Chatnachrichten für diesen Channel.' />

    <div className='flex gap-2'>
      <input className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Suche…' value={query} onChange={e => setQuery(e.target.value)} />
      <button className='px-3 py-2 rounded bg-zinc-800' onClick={() => setPaused((p) => !p)}>{paused ? 'Auto Scroll aktivieren' : 'Auto Scroll pausieren'}</button>
    </div>

    {error && <div className='text-amber-400 text-sm'>{error}</div>}

    <div ref={boxRef} className='h-[65vh] overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 space-y-2'>
      {!filtered.length
        ? <div className='text-zinc-400'>Noch keine Chatnachrichten. Schreibe etwas im Twitch Chat.</div>
        : filtered.map((m, i) => <div key={`${m.messageId || 'hist'}-${i}`} className='text-sm'>
          <span className='text-zinc-500 mr-2'>{new Date(m.createdAt).toLocaleTimeString()}</span>
          <span className='relative inline-block'>
            <button
              className={`${m.isCommand ? 'text-indigo-300 font-semibold' : 'text-cyan-300'} hover:underline`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUser(selectedUser?.messageId === m.messageId ? null : m);
              }}
            >
              {m.username}
            </button>
            {selectedUser?.messageId === m.messageId && <div className='absolute left-0 mt-1 w-52 rounded border border-zinc-700 bg-zinc-900 p-1 z-10'>
              {MOD_ACTIONS.map((action) => <button
                key={action.key}
                className='w-full text-left px-2 py-1 rounded text-zinc-200 hover:bg-zinc-800'
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAction(action.key);
                  setReason('');
                  setModMessage('');
                }}
              >
                {action.label}
              </button>)}
            </div>}
          </span>
          <span className='mx-2 text-zinc-500'>:</span>
          <span>{m.message}</span>
          {m.isCommand && <span className='ml-2 text-xs text-indigo-400'>COMMAND</span>}
        </div>)
      }
    </div>

    {selectedAction && selectedUser && <div className='rounded border border-zinc-700 bg-zinc-900 p-4 space-y-3'>
      <h2 className='font-semibold'>Moderation: {selectedAction} für @{selectedUser.username}</h2>
      {selectedAction === 'timeout' && <select className='px-2 py-2 rounded bg-zinc-950 border border-zinc-700 w-full' value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
        {TIMEOUT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>}
      <input className='px-3 py-2 rounded bg-zinc-950 border border-zinc-700 w-full' placeholder='Grund (optional)' value={reason} onChange={(e) => setReason(e.target.value)} />
      {modMessage && <div className='text-sm text-amber-300'>{modMessage}</div>}
      <div className='flex gap-2'>
        <button disabled={modLoading} className='px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50' onClick={runModeration}>{modLoading ? 'Sende...' : 'Aktion ausführen'}</button>
        <button className='px-3 py-2 rounded bg-zinc-800' onClick={() => setSelectedAction(null)}>Zurück</button>
      </div>
    </div>}
  </div>;
}
