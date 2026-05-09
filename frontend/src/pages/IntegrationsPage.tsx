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
  const [checkError, setCheckError] = useState('');
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
        <div>Plattform-Bot: <b>{data.botLogin}</b></div>
        <div>Führe in deinem Twitch-Chat aus: <code>{data.instruction}</code></div>
        <div>Status: {data.isModerator ? 'bereit' : 'Bot ist noch kein Moderator'}</div>
        {data.isModerator && <div className='text-emerald-300'>StreamForge sendet in diesem Channel als {data.botLogin}.</div>}
        {checkError && <ErrorBox message={checkError} />}
        <Button onClick={async () => { setCheckError(''); try { await apiPost(`/api/channels/${channelId}/twitch/bot/check`); await load(); } catch (e: any) { setCheckError(e?.data?.errorCode || 'Prüfung fehlgeschlagen'); } }}>Moderatorstatus prüfen</Button>
      </>}
    </Card>
  </div>;
}
