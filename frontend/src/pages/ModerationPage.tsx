import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import ErrorBox from '../components/ui/ErrorBox';

export default function ModerationPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [type, setType] = useState<'all'|'bans'|'timeouts'>('all');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>({ userId: '', username: '', action: 'ban', durationSeconds: 300, reason: '' });

  const load = async () => {
    const q = new URLSearchParams({ limit: '100', type, username });
    const [bans, log] = await Promise.all([
      apiGet<any>(`/api/channels/${channelId}/moderation/bans?${q.toString()}`),
      apiGet<any>(`/api/channels/${channelId}/moderation/actions?limit=50`)
    ]);
    setItems(bans.items || []);
    setActions(log.actions || []);
  };

  useEffect(() => { void load().catch(handleErr); }, [channelId, type]);

  const handleErr = (e: any) => {
    if (e?.data?.errorCode === 'twitch.moderation.scope_missing') setError('Bitte Twitch erneut verbinden, damit StreamForge Bans und Timeouts verwalten darf. Fehlender Scope: moderator:manage:banned_users');
    else setError(e?.data?.hint || e?.data?.errorCode || 'Fehler');
  };

  const submitManual = async () => {
    const isUnban = form.action === 'unban' || form.action === 'untimeout';
    if (!confirm('Diese Änderung wird direkt auf Twitch ausgeführt. Fortfahren?')) return;
    const path = isUnban ? 'unban' : form.action;
    const body: any = { userId: form.userId, username: form.username || undefined, reason: form.reason || undefined };
    if (form.action === 'timeout') body.durationSeconds = Number(form.durationSeconds);
    if (isUnban) body.actionLabel = form.action;
    await apiPost(`/api/channels/${channelId}/moderation/${path}`, body);
    await load();
  };

  const filtered = useMemo(() => items.filter((x) => !username || (x.userName || x.userLogin || '').toLowerCase().includes(username.toLowerCase())), [items, username]);

  return <div className='space-y-4'>
    <h1 className='text-xl font-bold'>Moderation</h1>
    <p className='text-sm text-amber-300'>Hier siehst du aktive Twitch-Bans und Timeouts und kannst sie entfernen.</p>
    {error && <ErrorBox message={error} />}
    {error.includes('moderator:manage:banned_users') && <Link className='underline text-blue-300' to='/api/auth/twitch/start'>Twitch erneut verbinden</Link>}

    <div className='border p-3 space-y-2'>
      <div className='flex gap-2'>
        <button className='border px-3 py-1' onClick={() => void load().catch(handleErr)}>Aktualisieren</button>
        <select className='border px-2 py-1' value={type} onChange={e => setType(e.target.value as any)}><option value='all'>Alle</option><option value='bans'>Bans</option><option value='timeouts'>Timeouts</option></select>
        <input className='border px-2 py-1' placeholder='Suche nach Username' value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <table className='w-full text-sm'>
        <thead><tr><th>User</th><th>Typ</th><th>Grund</th><th>Erstellt am</th><th>Läuft ab</th><th>Moderator</th><th>Aktion</th></tr></thead>
        <tbody>{filtered.map((u) => <tr key={`${u.userId}-${u.expiresAt || 'ban'}`}><td>{u.userName || u.userLogin}</td><td>{u.type === 'ban' ? 'Ban' : 'Timeout'}</td><td>{u.reason || '-'}</td><td>{u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}</td><td>{u.expiresAt ? new Date(u.expiresAt).toLocaleString() : '-'}</td><td>{u.moderatorName || '-'}</td><td><button className='underline' onClick={async () => { const label = u.type === 'ban' ? 'unban' : 'untimeout'; const msg = u.type === 'ban' ? `Möchtest du @${u.userName || u.userLogin} wirklich entbannen?` : `Möchtest du den Timeout von @${u.userName || u.userLogin} wirklich entfernen?`; if (!confirm(`${msg}\nDiese Änderung wird direkt auf Twitch ausgeführt.`)) return; await apiPost(`/api/channels/${channelId}/moderation/unban`, { userId: u.userId, username: u.userName || u.userLogin, actionLabel: label }); await load(); }}> {u.type === 'ban' ? 'Entbannen' : 'Timeout entfernen'} </button></td></tr>)}</tbody>
      </table>
    </div>

    <div className='border p-3 space-y-2'>
      <h2 className='font-semibold'>Manuelle Aktion</h2>
      <input className='border px-2 py-1 w-full' placeholder='User ID' value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
      <input className='border px-2 py-1 w-full' placeholder='Username optional' value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      <select className='border px-2 py-1 w-full' value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}><option value='ban'>Ban</option><option value='timeout'>Timeout</option><option value='unban'>Unban</option><option value='untimeout'>Timeout entfernen</option></select>
      {form.action === 'timeout' && <input className='border px-2 py-1 w-full' type='number' min={1} max={1209600} value={form.durationSeconds} onChange={e => setForm({ ...form, durationSeconds: e.target.value })} />}
      <input className='border px-2 py-1 w-full' placeholder='Grund optional' value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
      <button className='border px-3 py-1' onClick={() => void submitManual().catch(handleErr)}>Ausführen</button>
    </div>

    <div className='border p-3 space-y-2'><h2 className='font-semibold'>Moderationshistorie</h2>{actions.map((a) => <div key={a.id} className='text-sm'>{new Date(a.createdAt).toLocaleString()} · {a.actionType} · {a.targetUsername || a.targetExternalUserId} · {a.durationSeconds || '-'} · {a.reason || '-'} · {a.createdByUserId || '-'}</div>)}</div>
  </div>;
}
