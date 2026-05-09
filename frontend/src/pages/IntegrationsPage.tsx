import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ErrorBox from '../components/ui/ErrorBox';
import PageHeader from '../components/ui/PageHeader';
import { useAuth } from '../auth/AuthProvider';

export default function IntegrationsPage() {
  const { channelId = '' } = useParams();
  const { user } = useAuth() as any;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [checkError, setCheckError] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState('');
  const isAdmin = ['system_owner', 'platform_admin'].includes(user?.role || '');
  const load = async () => { setError(''); setData(await apiGet(`/api/channels/${channelId}/twitch/bot`)); };
  useEffect(() => { if (channelId) load().catch(() => setError('Integrationen konnten nicht geladen werden.')); }, [channelId]);

  return <div className='space-y-4'><PageHeader title='Integrationen' subtitle='Plattform-Bot im Twitch-Channel verwenden.' />
    {error && <ErrorBox message={error} />}
    <Card className='p-5 space-y-3 text-zinc-200'>
      {!data?.platformBotConnected ? <>
        <div className='text-amber-300'>Der Plattform-Bot wurde vom Betreiber noch nicht eingerichtet.</div>
        {isAdmin && <Link className='inline-block px-3 py-2 bg-indigo-600 rounded text-white' to='/admin/twitch'>Zum Adminbereich</Link>}
      </> : <>
        <div>Plattform-Bot vorhanden: <b>{data.botLogin}</b></div>
        <div>Führe in deinem Twitch-Chat aus: <code>{data.instruction}</code></div>
        <div>Plattform-Bot im Channel eingerichtet: {data.isModerator ? 'Ja' : 'Nein'}</div>
        <div>Plattform-Bot aktiv: {data.isModerator ? 'Ja, StreamForge kann als Bot senden.' : 'Noch nicht, bitte Bot als Moderator einrichten.'}</div>
        {data.isModerator && <div className='text-emerald-300'>{data.botLogin} ist Moderator in deinem Channel. StreamForge kann als {data.botLogin} antworten.</div>}
        {!data.isModerator && <div className='text-amber-300'>{data.botLogin} ist noch nicht als Moderator in deinem Twitch-Channel eingerichtet. <code>/mod {data.botLogin}</code></div>}
        {actionMessage && <div className='text-emerald-300'>{actionMessage}</div>}
        {checkError && <ErrorBox message={checkError.detail || checkError.errorCode || 'Prüfung fehlgeschlagen'} details={checkError.debug} />}
        {checkError?.errorCode === 'twitch.platform_bot.scope_missing' && <div className='text-amber-200'>Bitte Twitch erneut verbinden, damit StreamForge den Bot automatisch hinzufügen kann. <Link className='underline text-blue-300' to='/api/auth/twitch/start'>Twitch erneut verbinden</Link></div>}
        {!data.isModerator && data.canAutoAddModerator && <Button onClick={async () => {
          setActionMessage(''); setCheckError(null);
          if (!window.confirm(`Möchtest du ${data.botLogin} wirklich als Moderator in deinem Twitch-Channel hinzufügen?\n\nDiese Aktion wird direkt auf Twitch ausgeführt.`)) return;
          try { await apiPost(`/api/channels/${channelId}/twitch/bot/add-moderator`); await load(); setActionMessage(`${data.botLogin} wurde als Moderator hinzugefügt oder war bereits Moderator.`); }
          catch (e: any) { setCheckError(e?.data || { errorCode: 'twitch.platform_bot.add_moderator_failed', detail: 'Hinzufügen fehlgeschlagen' }); }
        }}>Bot automatisch als Moderator hinzufügen</Button>}
        <Button onClick={async () => { setActionMessage(''); setCheckError(null); try { await apiPost(`/api/channels/${channelId}/twitch/bot/check`); await load(); } catch (e: any) { setCheckError(e?.data || { errorCode: 'twitch.platform_bot.check_failed', detail: 'Prüfung fehlgeschlagen' }); } }}>{data.isModerator ? 'Status erneut prüfen' : 'Status prüfen'}</Button>
      </>}
    </Card>
  </div>;
}
