import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ErrorBox from '../components/ui/ErrorBox';
import PageHeader from '../components/ui/PageHeader';

export default function IntegrationsPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [checkError, setCheckError] = useState<any>(null);
  const load = async () => { setError(''); setData(await apiGet(`/api/channels/${channelId}/twitch/bot`)); };
  useEffect(() => { if (channelId) load().catch(() => setError('Integrationen konnten nicht geladen werden.')); }, [channelId]);

  const check = async () => { setCheckError(null); try { await apiPost(`/api/channels/${channelId}/twitch/bot/check`); await load(); } catch (e: any) { setCheckError(e?.data || { errorCode: 'twitch.platform_bot.check_failed', detail: 'Prüfung fehlgeschlagen' }); await load(); } };

  return <div className='space-y-4'><PageHeader title='Integrationen' subtitle='Plattform-Bot im Twitch-Channel verwenden.' />
    {error && <ErrorBox message={error} />}
    <Card className='p-5 space-y-3 text-zinc-200'>
      {!data?.platformBotConnected ? <div className='text-amber-300'>Der Plattform-Bot wurde vom Betreiber noch nicht eingerichtet.</div> : <>
        <div>Plattform-Bot vorhanden: <b>{data.botLogin}</b></div>
        <div>Führe in deinem Twitch-Chat aus: <code>{data.instruction}</code></div>
        {data.moderatorStatus === 'verified_moderator' && <div className='text-emerald-300'>{data.botLogin} ist Moderator in deinem Channel. StreamForge kann als {data.botLogin} antworten.</div>}
        {(data.moderatorStatus === 'unknown' || !data.lastCheckedAt) && <div className='text-amber-200'>Status wurde noch nicht geprüft.</div>}
        {data.moderatorStatus === 'not_moderator' && <div className='text-amber-300'>{data.botLogin} ist noch nicht als Moderator in deinem Channel eingerichtet. <code>/mod {data.botLogin}</code></div>}
        {data.moderatorStatus === 'scope_missing' && <div className='text-amber-300'>Der Twitch-Kanal muss erneut verbunden werden, damit StreamForge den Moderatorstatus prüfen kann. <Link to='/api/auth/twitch/start' className='underline'>Twitch erneut verbinden</Link></div>}
        {(data.moderatorStatus === 'api_failed' || data.moderatorStatus === 'check_failed') && <div className='text-rose-300'>Moderatorstatus konnte nicht geprüft werden.</div>}
        {checkError && <ErrorBox message={checkError.detail || checkError.errorCode || 'Prüfung fehlgeschlagen'} details={checkError} />}
        {data.canAutoAddModerator && data.moderatorStatus === 'not_moderator' && <Button onClick={async () => { try { await apiPost(`/api/channels/${channelId}/twitch/bot/add-moderator`); await load(); } catch (e: any) { setCheckError(e?.data || { detail: 'Hinzufügen fehlgeschlagen' }); } }}>Bot automatisch als Moderator hinzufügen</Button>}
        <Button onClick={check}>Moderatorstatus prüfen</Button>
      </>}
    </Card>
  </div>;
}
