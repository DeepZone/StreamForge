import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import ErrorBox from '../components/ui/ErrorBox';

export default function ChattersPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loadingByKey, setLoadingByKey] = useState<Record<string, boolean>>({});
  const load = async () => { try { setError(''); setData(await apiGet(`/api/channels/${channelId}/twitch/chatters?limit=200`)); } catch (e:any) { setError(e?.data?.detail || e?.data?.errorCode || 'Chatters konnten nicht geladen werden.'); } };
  useEffect(() => { void load(); }, [channelId]);
  const items = useMemo(() => (data?.items || []).filter((i:any) => String(i.userName).toLowerCase().includes(q.toLowerCase())), [data, q]);

  const act = async (u:any, action:string, label:string) => {
    if (!confirm(`Möchtest du @${u.userLogin} wirklich ${label}?\n\nDiese Änderung wird direkt auf Twitch ausgeführt.`)) return;
    const key = `${u.userId}-${action}`; setLoadingByKey((x)=>({ ...x, [key]: true }));
    try { await apiPost(`/api/channels/${channelId}/twitch/chatters/${u.userId}/role`, { action, username: u.userLogin }); await load(); alert('Rolle geändert.'); }
    catch (e:any) { setError(e?.data?.errorCode || 'Rollenänderung fehlgeschlagen.'); }
    finally { setLoadingByKey((x)=>({ ...x, [key]: false })); }
  };

  return <div className='space-y-3'>
    <PageHeader title='Chatters' subtitle='Die Twitch-Chatters-Liste kann verzögert sein.' />
    {error && <ErrorBox message={error} />}
    {data && data.roleStatusAvailable===false && <div className='p-3 rounded border border-amber-700 bg-amber-950 text-amber-200 text-sm'>Rollen können nicht gelesen oder geändert werden. Bitte verbinde den Twitch-Kanal erneut, damit StreamForge die neuen Scopes erhält. Fehlende Scopes: {(data.missingScopes||[]).join(', ')}. <a className='underline' href='/api/auth/twitch/start'>Twitch erneut verbinden</a></div>}
    <div className='flex gap-2'><input className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Suche' value={q} onChange={e => setQ(e.target.value)} /><button className='px-3 py-2 rounded bg-indigo-600' onClick={() => void load()}>Refresh</button></div>
    <div className='rounded border border-zinc-800 divide-y divide-zinc-800'>{items.map((c:any) => <div key={c.userId} className='p-2 grid md:grid-cols-8 gap-2 text-sm items-center'>
      <div>{c.userLogin}</div><div>{c.userName}</div><div>{c.userId}</div><div className='font-semibold'>{c.role || 'unknown'}</div>
      <div>{c.messageCount}</div><div>{c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString() : '-'}</div>
      <div className='flex flex-wrap gap-1 col-span-2'>
        {c.roleCapabilities?.canMakeModerator && <button disabled={loadingByKey[`${c.userId}-make_moderator`]} className='px-2 py-1 rounded bg-indigo-600' onClick={() => void act(c, 'make_moderator', 'zum Moderator machen')}>Zum Moderator machen</button>}
        {c.roleCapabilities?.canRemoveModerator && <button disabled={loadingByKey[`${c.userId}-remove_moderator`]} className='px-2 py-1 rounded bg-rose-700' onClick={() => void act(c, 'remove_moderator', 'als Moderator entfernen')}>Moderator entfernen</button>}
        {c.roleCapabilities?.canMakeVip && <button disabled={loadingByKey[`${c.userId}-make_vip`]} className='px-2 py-1 rounded bg-purple-600' onClick={() => void act(c, 'make_vip', 'zum VIP machen')}>Zum VIP machen</button>}
        {c.roleCapabilities?.canRemoveVip && <button disabled={loadingByKey[`${c.userId}-remove_vip`]} className='px-2 py-1 rounded bg-orange-700' onClick={() => void act(c, 'remove_vip', 'als VIP entfernen')}>VIP entfernen</button>}
      </div>
    </div>)}</div>
  </div>;
}
