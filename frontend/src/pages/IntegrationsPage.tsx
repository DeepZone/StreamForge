import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ErrorBox from '../components/ui/ErrorBox';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export default function IntegrationsPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [confirmOpen, setConfirmOpen] = useState(false);
  const [debug, setDebug] = useState<any>(null);
  const load = async () => { setError(''); setData(await apiGet(`/api/channels/${channelId}/twitch/bot`)); setDebug(await apiGet(`/api/channels/${channelId}/twitch/debug`)); };
  useEffect(() => { if (channelId) load().catch(() => setError('Integrationen konnten nicht geladen werden.')); }, [channelId]);
  return <div className='space-y-4'><PageHeader title='Integrationen' subtitle='Plattform-Bot und Twitch-Diagnose' />
    {error && <ErrorBox message={error} />}
    <Card className='p-4 space-y-2'>
      <div>Plattform-Bot vorhanden: <StatusBadge status={data?.platformBotConnected ? 'connected' : 'disconnected'} /></div>
      <div>Bot im Channel: <StatusBadge status={data?.moderatorStatus || 'unknown'} /></div>
      <div>Bot sendefähig: <StatusBadge status={data?.canSendAsPlatformBot ? 'verified_moderator' : 'not_moderator'} /></div>
      {data?.moderatorStatus === 'scope_missing' && <div className='text-amber-300 text-sm'>Scope fehlt. <Link to='/api/auth/twitch/start' className='underline'>Twitch erneut verbinden</Link></div>}
      <div className='flex gap-2'>
        <Button onClick={async () => { try { await apiPost(`/api/channels/${channelId}/twitch/bot/check`); await load(); } catch { await load(); } }}>Moderatorstatus prüfen</Button>
        {data?.canAutoAddModerator && data?.moderatorStatus === 'not_moderator' && <Button onClick={() => setConfirmOpen(true)}>Bot automatisch hinzufügen</Button>}
      </div>
    </Card>
    {debug && <Card className='p-4 space-y-2 text-sm'>
      <div className='font-semibold'>Channel Debug</div>
      <div>EventSub: {debug.eventSub.sessionStatus || debug.eventSub.status} / subscribed: {String(debug.eventSub.subscribed)}</div>
      <div>Last Message At: {debug.eventSub.lastMessageAt ? new Date(debug.eventSub.lastMessageAt).toLocaleString() : '-'}</div>
      <div>Last Stored Message: {debug.chat.lastStoredMessageAt ? new Date(debug.chat.lastStoredMessageAt).toLocaleString() : '-'}</div>
      <div>Live Stream Subscribers: {debug.liveStream.subscribers ?? 0}</div>
    </Card>}
    <ConfirmDialog open={confirmOpen} title='Bot als Moderator hinzufügen?' description='Diese Änderung wird direkt auf Twitch ausgeführt.' confirmLabel='Jetzt hinzufügen' onCancel={() => setConfirmOpen(false)} onConfirm={async () => { setConfirmOpen(false); await apiPost(`/api/channels/${channelId}/twitch/bot/add-moderator`); await load(); }} />
  </div>;
}
