import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import ErrorBox from '../components/ui/ErrorBox';

type DialogState = null | { type: 'timeout'|'ban'|'unban'; user: any };

export default function ChattersPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [duration, setDuration] = useState(300);
  const [reason, setReason] = useState('');

  const load = async () => { try { setError(''); setData(await apiGet(`/api/channels/${channelId}/twitch/chatters?limit=200`)); } catch (e:any) { setError(e?.data?.detail || e?.data?.errorCode || 'Chatters konnten nicht geladen werden.'); } };
  useEffect(() => { void load(); }, [channelId]);
  const items = useMemo(() => (data?.items || []).filter((i:any) => String(i.userName).toLowerCase().includes(q.toLowerCase()) || String(i.userLogin).toLowerCase().includes(q.toLowerCase())), [data, q]);

  const roleAct = async (u:any, action:string, label:string) => {
    if (!confirm(`Möchtest du @${u.userLogin} wirklich ${label}?`)) return;
    setLoading(true);
    try { await apiPost(`/api/channels/${channelId}/twitch/chatters/${u.userId}/role`, { action, username: u.userLogin }); await load(); alert('Rolle geändert.'); }
    catch (e:any) { setError(e?.data?.errorCode || 'Rollenänderung fehlgeschlagen.'); }
    finally { setLoading(false); setMenuUserId(null); }
  };

  const moderationAct = async () => {
    if (!dialog) return;
    setLoading(true);
    try {
      await apiPost(`/api/channels/${channelId}/twitch/chatters/${dialog.user.userId}/moderation`, {
        action: dialog.type,
        username: dialog.user.userLogin,
        ...(dialog.type === 'timeout' ? { durationSeconds: duration } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {})
      });
      await load();
      setDialog(null); setReason('');
      alert('Moderationsaktion durchgeführt.');
    } catch (e:any) {
      const code = e?.data?.errorCode || 'Moderationsaktion fehlgeschlagen.';
      setError(code === 'twitch.moderation.scope_missing' ? 'Bitte Twitch erneut verbinden, damit StreamForge diese Aktion ausführen darf.' : code);
    } finally { setLoading(false); setMenuUserId(null); }
  };

  return <div className='space-y-3'>
    <PageHeader title='Chatters' subtitle='Die Twitch-Chatters-Liste kann verzögert sein.' />
    {error && <ErrorBox message={error} />}
    {data && data.roleStatusAvailable===false && <div className='p-3 rounded border border-amber-700 bg-amber-950 text-amber-200 text-sm'>Rollen können nicht gelesen oder geändert werden. Bitte verbinde den Twitch-Kanal erneut. Fehlende Scopes: {(data.missingScopes||[]).join(', ')}. <a className='underline' href='/api/auth/twitch/start'>Twitch erneut verbinden</a></div>}
    {data && data.moderationStatusAvailable===false && <div className='p-3 rounded border border-amber-700 bg-amber-950 text-amber-200 text-sm'>Moderationsstatus ist aktuell nicht vollständig verfügbar. Timeout/Ban sind weiterhin möglich.</div>}
    <div className='flex gap-2'><input className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Suche' value={q} onChange={e => setQ(e.target.value)} /><button className='px-3 py-2 rounded bg-indigo-600' onClick={() => void load()}>Refresh</button></div>
    <div className='rounded border border-zinc-800 divide-y divide-zinc-800'>{items.map((c:any) => <div key={c.userId} className='p-2 grid md:grid-cols-8 gap-2 text-sm items-center'>
      <div>{c.userLogin}</div><div>{c.userName}</div><div>{c.userId}</div><div className='font-semibold'>{c.role || 'unknown'}</div>
      <div>{c.messageCount}</div><div>{c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString() : '-'}</div>
      <div className='relative col-span-2 text-right'>
        <button className='px-2 py-1 rounded bg-zinc-700' onClick={() => setMenuUserId(menuUserId === c.userId ? null : c.userId)}>⋯</button>
        {menuUserId === c.userId && <div className='absolute right-0 mt-1 z-20 min-w-56 bg-zinc-900 border border-zinc-700 rounded shadow p-1 text-left'>
          {c.roleCapabilities?.canMakeModerator && <button className='block w-full px-2 py-1 hover:bg-zinc-800 rounded' disabled={loading} onClick={() => void roleAct(c, 'make_moderator', 'zum Moderator machen')}>Zum Moderator machen</button>}
          {c.roleCapabilities?.canRemoveModerator && <button className='block w-full px-2 py-1 hover:bg-zinc-800 rounded' disabled={loading} onClick={() => void roleAct(c, 'remove_moderator', 'als Moderator entfernen')}>Moderator entfernen</button>}
          {c.roleCapabilities?.canMakeVip && <button className='block w-full px-2 py-1 hover:bg-zinc-800 rounded' disabled={loading} onClick={() => void roleAct(c, 'make_vip', 'zum VIP machen')}>Zum VIP machen</button>}
          {c.roleCapabilities?.canRemoveVip && <button className='block w-full px-2 py-1 hover:bg-zinc-800 rounded' disabled={loading} onClick={() => void roleAct(c, 'remove_vip', 'als VIP entfernen')}>VIP entfernen</button>}
          {c.moderationCapabilities?.canTimeout && <button className='block w-full px-2 py-1 hover:bg-zinc-800 rounded' onClick={() => { setDialog({ type: 'timeout', user: c }); setMenuUserId(null); }}>Timeout</button>}
          {c.moderationCapabilities?.canBan && <button className='block w-full px-2 py-1 hover:bg-zinc-800 rounded' onClick={() => { setDialog({ type: 'ban', user: c }); setMenuUserId(null); }}>Ban</button>}
          {c.moderationCapabilities?.canUnban && <button className='block w-full px-2 py-1 hover:bg-zinc-800 rounded' onClick={() => { setDialog({ type: 'unban', user: c }); setMenuUserId(null); }}>Unban / Timeout entfernen</button>}
          {!c.roleCapabilities?.canMakeModerator && !c.roleCapabilities?.canRemoveModerator && !c.roleCapabilities?.canMakeVip && !c.roleCapabilities?.canRemoveVip && !c.moderationCapabilities?.canTimeout && !c.moderationCapabilities?.canBan && !c.moderationCapabilities?.canUnban && <div className='px-2 py-1 text-slate-400'>Keine Aktionen verfügbar</div>}
        </div>}
      </div>
    </div>)}</div>
    {dialog && <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'><div className='bg-zinc-900 border border-zinc-700 rounded p-4 w-full max-w-lg space-y-3'>
      <div className='font-semibold'>{dialog.type === 'timeout' ? `@${dialog.user.userLogin} timeouten` : dialog.type === 'ban' ? `@${dialog.user.userLogin} bannen` : `@${dialog.user.userLogin} entbannen / Timeout entfernen`}</div>
      {dialog.type === 'timeout' && <select className='w-full px-2 py-2 bg-zinc-800 rounded' value={duration} onChange={(e)=>setDuration(Number(e.target.value))}><option value={60}>60 Sekunden</option><option value={300}>5 Minuten</option><option value={600}>10 Minuten</option><option value={3600}>1 Stunde</option><option value={86400}>24 Stunden</option><option value={1209600}>14 Tage</option></select>}
      {(dialog.type === 'timeout' || dialog.type === 'ban') && <input className='w-full px-2 py-2 bg-zinc-800 rounded' maxLength={500} value={reason} placeholder='Grund (optional)' onChange={(e)=>setReason(e.target.value)} />}
      <div className='text-sm text-amber-300'>{dialog.type === 'ban' ? 'Diese Aktion bannt den Nutzer direkt auf Twitch.' : dialog.type === 'unban' ? 'Diese Aktion entfernt einen Ban oder aktiven Timeout direkt auf Twitch.' : 'Diese Aktion wird direkt auf Twitch ausgeführt.'}</div>
      <div className='flex justify-end gap-2'><button className='px-3 py-2 rounded bg-zinc-700' onClick={() => setDialog(null)}>Abbrechen</button><button disabled={loading} className='px-3 py-2 rounded bg-red-700' onClick={() => void moderationAct()}>{dialog.type === 'timeout' ? 'Timeout ausführen' : dialog.type === 'ban' ? 'Ban ausführen' : 'Unban ausführen'}</button></div>
    </div></div>}
  </div>;
}
