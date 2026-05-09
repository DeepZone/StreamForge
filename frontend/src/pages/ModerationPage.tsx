import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import ErrorBox from '../components/ui/ErrorBox';

const DURATIONS = [
  { label: '60 Sekunden', value: 60 },
  { label: '5 Minuten', value: 300 },
  { label: '10 Minuten', value: 600 },
  { label: '1 Stunde', value: 3600 },
  { label: '24 Stunden', value: 86400 }
];

export default function ModerationPage() {
  const { channelId = '' } = useParams();
  const [form, setForm] = useState<any>({ action: 'timeout', userId: '', username: '', reason: '', duration: 300, customDuration: 300 });
  const [actions, setActions] = useState<any[]>([]);
  const [restrictedUsers, setRestrictedUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ actionType: '', username: '' });

  const loadActions = () => apiGet<any>(`/api/channels/${channelId}/moderation/actions?limit=100&actionType=${filter.actionType}&username=${encodeURIComponent(filter.username)}`)
    .then((d) => setActions(d.actions || []))
    .catch((e: any) => setError(e?.data?.errorCode || 'Fehler'));

  const loadRestrictedUsers = () => apiGet<any>(`/api/channels/${channelId}/moderation/restricted-users`)
    .then((d) => setRestrictedUsers(d.users || []))
    .catch((e: any) => setError(e?.data?.errorCode || 'Fehler'));

  useEffect(() => {
    void loadActions();
  }, [channelId, filter.actionType, filter.username]);

  useEffect(() => {
    void loadRestrictedUsers();
  }, [channelId]);

  const submit = async () => {
    if (!confirm('Moderationsaktionen werden direkt auf Twitch ausgeführt. Fortfahren?')) return;
    setLoading(true);
    setError('');
    try {
      const body: any = { userId: form.userId, username: form.username || undefined, reason: form.reason || undefined };
      if (form.action === 'timeout') body.durationSeconds = form.duration === 'custom' ? Number(form.customDuration) : Number(form.duration);
      await apiPost(`/api/channels/${channelId}/moderation/${form.action}`, body);
      await Promise.all([loadActions(), loadRestrictedUsers()]);
    } catch (e: any) {
      setError(e?.data?.errorCode || 'Aktion fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return <div className='space-y-4'>
    <h1 className='text-xl font-bold'>Moderation</h1>
    <p className='text-sm text-amber-300'>Moderationsaktionen werden direkt auf Twitch ausgeführt. Kein Auto-Ban, kein Auto-Timeout.</p>
    {error && <ErrorBox message={error} />}

    <div className='border p-3 space-y-2'>
      <input className='border px-2 py-1 w-full' placeholder='Twitch User ID' value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} />
      <input className='border px-2 py-1 w-full' placeholder='Username (optional)' value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
      <select className='border px-2 py-1 w-full' value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}>
        <option value='timeout'>Timeout</option>
        <option value='ban'>Ban</option>
      </select>
      {form.action === 'timeout' && <>
        <select className='border px-2 py-1 w-full' value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}>
          {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          <option value='custom'>Custom</option>
        </select>
        {form.duration === 'custom' && <input className='border px-2 py-1 w-full' type='number' min={1} max={1209600} value={form.customDuration} onChange={e => setForm({ ...form, customDuration: e.target.value })} />}
      </>}
      <input className='border px-2 py-1 w-full' placeholder='Grund (optional)' value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
      <button disabled={loading} className='border px-3 py-1' onClick={submit}>{loading ? 'Sende...' : 'Aktion ausführen'}</button>
    </div>

    <div className='border p-3 space-y-2'>
      <h2 className='font-semibold'>Aktive Einschränkungen</h2>
      {!restrictedUsers.length
        ? <p className='text-sm text-slate-400'>Aktuell sind keine User gebannt oder getimeoutet.</p>
        : <div className='space-y-2'>{restrictedUsers.map((u) => <div key={`${u.userId}-${u.expiresAt || 'ban'}`} className='border p-2 text-sm'>
          <div className='font-medium'>{u.username}</div>
          <div className='text-slate-400'>{u.expiresAt ? `Timeout bis ${new Date(u.expiresAt).toLocaleString()}` : 'Permanent gebannt'}</div>
          {u.reason && <div className='text-slate-500'>Grund: {u.reason}</div>}
        </div>)}</div>}
    </div>

    <div className='border p-3 space-y-2'>
      <h2 className='font-semibold'>Moderation Log</h2>
      <div className='flex gap-2'>
        <input className='border px-2 py-1' placeholder='Filter Username' value={filter.username} onChange={e => setFilter({ ...filter, username: e.target.value })} />
        <select className='border px-2 py-1' value={filter.actionType} onChange={e => setFilter({ ...filter, actionType: e.target.value })}>
          <option value=''>Alle</option>
          <option value='timeout'>timeout</option>
          <option value='ban'>ban</option>
          <option value='unban'>unban</option>
        </select>
      </div>
      {!actions.length ? <p className='text-sm text-slate-400'>Noch keine Moderationsaktionen.</p> : actions.map((a) => <div key={a.id} className='border p-2 text-sm'>{a.actionType} · {a.targetUsername || a.targetExternalUserId} {a.durationSeconds ? `· ${a.durationSeconds}s` : ''} · {new Date(a.createdAt).toLocaleString()}</div>)}
    </div>
  </div>;
}
