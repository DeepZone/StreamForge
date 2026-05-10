import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import ActionMenu from '../components/ui/ActionMenu';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import ErrorBox from '../components/ui/ErrorBox';
import LoadingState from '../components/ui/LoadingState';
import PageHeader from '../components/ui/PageHeader';

type DialogState = null | { type: 'timeout'|'ban'|'unban'; user: any };
const roleBadge = (role?: string) => ({ broadcaster: 'success', moderator: 'warning', vip: 'default', viewer: 'muted', unknown: 'danger' }[String(role || 'unknown').toLowerCase()] as any || 'muted');

export default function ChattersPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [duration, setDuration] = useState(300);
  const [reason, setReason] = useState('');
  const [actingUserId, setActingUserId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const load = async () => { try { setError(''); setLoading(true); setData(await apiGet(`/api/channels/${channelId}/twitch/chatters?limit=200`)); setLastRefresh(new Date().toISOString()); } catch (e:any) { setError(e?.data?.detail || e?.data?.errorCode || 'Chatters konnten nicht geladen werden.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [channelId]);
  const items = useMemo(() => (data?.items || []).filter((i:any) => String(i.userName || '').toLowerCase().includes(q.toLowerCase()) || String(i.userLogin || '').toLowerCase().includes(q.toLowerCase())), [data, q]);

  const roleAct = async (u:any, action:string) => {
    setActingUserId(u.userId);
    try { await apiPost(`/api/channels/${channelId}/twitch/chatters/${u.userId}/role`, { action, username: u.userLogin }); await load(); }
    catch (e:any) { setError(e?.data?.errorCode === 'twitch.moderation.scope_missing' ? 'Bitte Twitch erneut verbinden, damit Rollen- und Moderationsaktionen verfügbar sind.' : e?.data?.errorCode || 'Rollenänderung fehlgeschlagen.'); }
    finally { setActingUserId(null); }
  };

  const moderationAct = async () => {
    if (!dialog) return;
    setActingUserId(dialog.user.userId);
    try {
      await apiPost(`/api/channels/${channelId}/twitch/chatters/${dialog.user.userId}/moderation`, { action: dialog.type, username: dialog.user.userLogin, ...(dialog.type === 'timeout' ? { durationSeconds: duration } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) });
      await load(); setDialog(null); setReason('');
    } catch (e:any) {
      const code = e?.data?.errorCode || 'Moderationsaktion fehlgeschlagen.';
      setError(code === 'twitch.moderation.scope_missing' ? 'Bitte Twitch erneut verbinden, damit Rollen- und Moderationsaktionen verfügbar sind.' : code);
    } finally { setActingUserId(null); }
  };

  return <div className='space-y-4'>
    <PageHeader title='Chatters' subtitle='Viewer-Liste und Rollenstatus für deinen Twitch-Channel.' actions={<button className='rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500' onClick={() => void load()}>Refresh</button>} />
    <div className='text-xs text-zinc-400'>Letzte Aktualisierung: {lastRefresh ? new Date(lastRefresh).toLocaleString() : '-'} · Twitch Chatters können verzögert aktualisiert werden.</div>
    {error && <ErrorBox message={error} />}
    {data?.roleStatusAvailable === false && <ErrorBox message='Bitte Twitch erneut verbinden, damit Rollen- und Moderationsaktionen verfügbar sind.' details={data?.missingScopes} />}
    {data?.roleStatusAvailable === false && <Link className='underline text-amber-300 text-sm' to='/api/auth/twitch/start'>Twitch erneut verbinden</Link>}
    <input className='w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2' placeholder='Nach Username/Login suchen…' value={q} onChange={e => setQ(e.target.value)} />
    {loading && <LoadingState label='Chatters werden geladen…' />}
    {!loading && items.length === 0 && <EmptyState title='Keine Chatters gefunden' description='Es wurden keine Viewer für diesen Channel zurückgegeben.' />}
    {!loading && items.length > 0 && <div className='overflow-auto rounded-xl border border-zinc-800'>
      <table className='w-full text-sm'>
        <thead className='bg-zinc-900 text-zinc-300'><tr><th className='p-2 text-left'>Username</th><th className='p-2 text-left'>Twitch Login</th><th className='p-2 text-left'>Rolle</th><th className='p-2 text-left'>MessageCount</th><th className='p-2 text-left'>CommandCount</th><th className='p-2 text-left'>LastSeen</th><th className='p-2 text-right'>Aktionen</th></tr></thead>
        <tbody>{items.map((c:any) => {
          const menu = [
            c.roleCapabilities?.canMakeModerator && { label: 'Moderator machen', onClick: () => void roleAct(c, 'make_moderator'), disabled: actingUserId === c.userId },
            c.roleCapabilities?.canRemoveModerator && { label: 'Moderator entfernen', onClick: () => void roleAct(c, 'remove_moderator'), disabled: actingUserId === c.userId },
            c.roleCapabilities?.canMakeVip && { label: 'VIP machen', onClick: () => void roleAct(c, 'make_vip'), disabled: actingUserId === c.userId },
            c.roleCapabilities?.canRemoveVip && { label: 'VIP entfernen', onClick: () => void roleAct(c, 'remove_vip'), disabled: actingUserId === c.userId },
            c.moderationCapabilities?.canTimeout && { label: 'Timeout', onClick: () => setDialog({ type: 'timeout', user: c }) },
            c.moderationCapabilities?.canBan && { label: 'Ban', onClick: () => setDialog({ type: 'ban', user: c }), destructive: true },
            c.moderationCapabilities?.canUnban && { label: 'Unban / Timeout entfernen', onClick: () => setDialog({ type: 'unban', user: c }) }
          ].filter(Boolean) as any[];
          return <tr key={c.userId} className='border-t border-zinc-800'><td className='p-2'>{c.userName || '-'}</td><td className='p-2'>{c.userLogin || '-'}</td><td className='p-2'><Badge variant={roleBadge(c.role)}>{c.role || 'unknown'}</Badge></td><td className='p-2'>{c.messageCount ?? 0}</td><td className='p-2'>{c.commandCount ?? 0}</td><td className='p-2'>{c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString() : '-'}</td><td className='p-2 text-right'><ActionMenu items={menu} buttonLabel={actingUserId === c.userId ? '…' : '⋯'} /></td></tr>;
        })}</tbody>
      </table>
    </div>}
    <ConfirmDialog open={!!dialog} title={dialog?.type === 'timeout' ? 'Timeout ausführen?' : dialog?.type === 'ban' ? 'Ban ausführen?' : 'Unban ausführen?'} description='Diese Aktion wird direkt auf Twitch ausgeführt.' confirmLabel='Ausführen' onCancel={() => setDialog(null)} onConfirm={() => void moderationAct()} />
    {dialog?.type === 'timeout' && <div className='rounded-xl border border-zinc-700 bg-zinc-900 p-3 space-y-2'><select className='w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2' value={duration} onChange={(e)=>setDuration(Number(e.target.value))}><option value={60}>60 Sekunden</option><option value={300}>5 Minuten</option><option value={600}>10 Minuten</option><option value={3600}>1 Stunde</option><option value={86400}>24 Stunden</option><option value={1209600}>14 Tage</option></select><input className='w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2' maxLength={500} value={reason} placeholder='Grund (optional)' onChange={(e)=>setReason(e.target.value)} /></div>}
  </div>;
}
