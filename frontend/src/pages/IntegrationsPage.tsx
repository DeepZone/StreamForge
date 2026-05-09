import { useEffect, useState } from 'react';
import { apiBase, apiGet, apiPost } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { useParams } from 'react-router-dom';

export default function IntegrationsPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const load = async () => setData(await apiGet(`/api/channels/${channelId}/twitch/bot`));
  useEffect(() => { if (channelId) load().catch(() => setData({ connected: false })); }, [channelId]);
  const connectUrl = `${apiBase}/api/admin/twitch/platform-bot/start`;
  return <div className='space-y-4'>
    <PageHeader title='Integrationen' subtitle='StreamForge Bot im Twitch-Channel.' />
    <Card className='p-5 space-y-3 text-zinc-200'>
      <h2 className='text-lg font-semibold'>StreamForge Bot im Twitch-Channel</h2>
      <div>Status: {data?.connected ? 'verbunden' : 'nicht verbunden'}</div>
      {data?.connected ? <>
        <div>Bot: {data.botDisplayName} ({data.botLogin})</div>
        <div>Anleitung: Führe in deinem Twitch-Chat aus: <code>/mod {data.botLogin}</code></div>
        <div>Token Expires At: {new Date(data.tokenExpiresAt).toLocaleString()}</div>
        <div>Scopes: {(data.scopes || []).join(', ')}</div>
        <div>Status: {data.isModerator ? 'bereit' : 'Bot ist noch kein Moderator'}</div>
        <Button onClick={async () => { await apiPost(`/api/channels/${channelId}/twitch/bot/check`); await load(); }}>Moderatorstatus prüfen</Button>
      </> : <>
        <div className='text-amber-300'>Der Plattform-Bot wurde vom Administrator noch nicht verbunden.</div>
        <a className='inline-block px-3 py-2 bg-indigo-600 rounded text-white' href={connectUrl}>Plattform-Bot verbinden</a>
      </>}
    </Card>
  </div>;
}
