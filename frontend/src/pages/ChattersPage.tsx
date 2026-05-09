import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import ErrorBox from '../components/ui/ErrorBox';

type Role = 'viewer' | 'channel_moderator' | 'channel_admin' | 'channel_owner';

const roleOptions: Array<{ value: Role; label: string; icon: string }> = [
  { value: 'viewer', label: 'Viewer', icon: '👤' },
  { value: 'channel_moderator', label: 'Moderator', icon: '🛡️' },
  { value: 'channel_admin', label: 'Channel Admin', icon: '⚙️' },
  { value: 'channel_owner', label: 'Channel Owner', icon: '👑' }
];

const roleIcon = (role?: Role) => roleOptions.find((x) => x.value === role)?.icon || '👤';

export default function ChattersPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [rolesByLogin, setRolesByLogin] = useState<Record<string, Role>>({});
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('username');
  const [action, setAction] = useState<'timeout' | 'ban'>('timeout');
  const [duration, setDuration] = useState(300);

  const loadChatters = () => apiGet(`/api/channels/${channelId}/twitch/chatters?limit=200`).then(setData);
  const loadRoles = () => apiGet<any>(`/api/channels/${channelId}/chatters/roles`).then((d) => setRolesByLogin(d.rolesByLogin || {}));

  const loadAll = () => Promise.all([loadChatters(), loadRoles()]).catch((e: any) => {
    const code = e?.data?.errorCode;
    if (code === 'twitch.chatters.missing_scope') setError('Bitte Twitch erneut verbinden, damit StreamForge die aktuelle Chatters-Liste lesen darf.');
    else setError(e?.data?.detail || 'Chatters konnten nicht geladen werden.');
  });

  useEffect(() => { void loadAll(); }, [channelId]);

  const runModeration = async (user: any) => {
    const reason = prompt(`Grund für ${action} bei ${user.userName} (optional):`) || undefined;
    if (!confirm(`Aktion ${action} für ${user.userName} wirklich ausführen?`)) return;
    try {
      const body: any = { userId: user.userId, username: user.userLogin, reason };
      if (action === 'timeout') body.durationSeconds = duration;
      await apiPost(`/api/channels/${channelId}/moderation/${action}`, body);
      await loadAll();
    } catch (e: any) {
      setError(e?.data?.hint || e?.data?.detail || e?.data?.errorCode || 'Moderation fehlgeschlagen.');
    }
  };

  const setRole = async (userLogin: string, role: Role) => {
    try {
      await apiPatch(`/api/channels/${channelId}/chatters/roles`, { userLogin, role });
      await loadRoles();
    } catch (e: any) {
      setError(e?.data?.detail || e?.data?.errorCode || 'Rolle konnte nicht gesetzt werden.');
    }
  };

  const items = useMemo(() => {
    const raw = (data?.items || []).filter((i: any) => i.userName.toLowerCase().includes(q.toLowerCase()));
    return raw.sort((a: any, b: any) => sort === 'messageCount' ? b.messageCount - a.messageCount : sort === 'lastSeen' ? String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')) : a.userName.localeCompare(b.userName));
  }, [data, q, sort]);

  return <div className='space-y-3'>
    <PageHeader title='Chatters' subtitle='Aktuelle Twitch-Chatmitglieder inkl. Moderation und StreamForge-Rollenverwaltung.' />
    {error && <ErrorBox message={error} />}
    <div className='flex gap-2 flex-wrap'>
      <input className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Suche Username' value={q} onChange={e => setQ(e.target.value)} />
      <select value={sort} onChange={e => setSort(e.target.value)} className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700'><option value='username'>Username</option><option value='messageCount'>Message Count</option><option value='lastSeen'>Last Seen</option></select>
      <select value={action} onChange={(e) => setAction(e.target.value as 'timeout' | 'ban')} className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700'><option value='timeout'>Timeout</option><option value='ban'>Ban</option></select>
      {action === 'timeout' && <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700'><option value={60}>60s</option><option value={300}>5m</option><option value={600}>10m</option><option value={3600}>1h</option><option value={86400}>24h</option></select>}
    </div>
    <div className='text-sm text-zinc-400'>Gesamt: {data?.total ?? 0} · {data?.note ?? ''}</div>
    {!items.length ? <div className='text-zinc-400'>Keine aktiven Chatters gefunden.</div> : <div className='rounded border border-zinc-800 divide-y divide-zinc-800'>{items.map((c: any) => {
      const role = rolesByLogin[c.userLogin?.toLowerCase()] as Role | undefined;
      return <div key={c.userId} className='p-2 text-sm grid md:grid-cols-7 gap-2 items-center'>
        <div>{c.userName}</div>
        <div>Messages: {c.messageCount}</div>
        <div>Commands: {c.commandCount}</div>
        <div>Last Seen: {c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString() : '-'}</div>
        <div className='text-xs' title='StreamForge-Rolle'>{roleIcon(role)} {role || 'viewer'}</div>
        <select className='px-2 py-1 rounded bg-zinc-900 border border-zinc-700' value={role || 'viewer'} onChange={(e) => void setRole(c.userLogin, e.target.value as Role)}>{roleOptions.map((r) => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}</select>
        <button className='px-2 py-1 rounded bg-amber-700 text-white' onClick={() => void runModeration(c)}>{action}</button>
      </div>;
    })}</div>}
  </div>;
}
