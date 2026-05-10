import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ErrorBox from '../components/ui/ErrorBox';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmDialog from '../components/ui/ConfirmDialog';

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export default function IntegrationsPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [debug, setDebug] = useState<any>(null);
  const [error, setError] = useState('');
  const [debugError, setDebugError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    setDebugError('');
    try {
      const botData = await apiGet(`/api/channels/${channelId}/twitch/bot`);
      setData(botData);
    } catch {
      setError('Integrationen konnten nicht geladen werden.');
      setLoading(false);
      return;
    }

    try {
      const debugData = await apiGet(`/api/channels/${channelId}/twitch/debug`);
      setDebug(debugData);
    } catch {
      setDebug(null);
      setDebugError('Debugdaten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (channelId) {
      load();
    }
  }, [channelId]);

  const eventSubStatus =
    debug?.eventSub?.sessionStatus ??
    debug?.eventSub?.status ??
    debug?.session?.status ??
    'unknown';

  const subscribed =
    debug?.eventSub?.subscribed ??
    debug?.session?.subscribed ??
    false;

  const lastMessageAt =
    debug?.eventSub?.lastMessageAt ??
    debug?.session?.lastMessageAt ??
    null;

  const lastStoredMessageAt = debug?.chat?.lastStoredMessageAt ?? null;
  const liveSubscribers = debug?.liveStream?.subscribers ?? 0;

  return <div className='space-y-4'><PageHeader title='Integrationen' subtitle='Plattform-Bot und Twitch-Diagnose' />
    {loading && <div className='text-sm text-zinc-300'>Integrationen werden geladen...</div>}
    {error && <ErrorBox message={error} />}
    {debugError && <ErrorBox message={debugError} />}
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
      <div>EventSub: {eventSubStatus || 'unknown'} / subscribed: {String(subscribed)}</div>
      <div>Last Message At: {formatDateTime(lastMessageAt)}</div>
      <div>Last Stored Message: {formatDateTime(lastStoredMessageAt)}</div>
      <div>Live Stream Subscribers: {liveSubscribers}</div>
    </Card>}
    <ConfirmDialog open={confirmOpen} title='Bot als Moderator hinzufügen?' description='Diese Änderung wird direkt auf Twitch ausgeführt.' confirmLabel='Jetzt hinzufügen' onCancel={() => setConfirmOpen(false)} onConfirm={async () => {
      setConfirmOpen(false);
      try {
        await apiPost(`/api/channels/${channelId}/twitch/bot/add-moderator`);
        await load();
      } catch {
        setError('Bot konnte nicht automatisch hinzugefügt werden.');
      }
    }} />
  </div>;
}
