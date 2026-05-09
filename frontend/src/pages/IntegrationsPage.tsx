import { useEffect, useState } from 'react';
import { apiBase, apiDelete, apiGet } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { useParams } from 'react-router-dom';

export default function IntegrationsPage() {
  const { channelId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const load = async () => setData(await apiGet(`/api/channels/${channelId}/twitch/bot`));
  useEffect(() => { if (channelId) load().catch(() => setData({ connected: false })); }, [channelId]);
  const connectUrl = `${apiBase}/api/channels/${channelId}/twitch/bot/start`;
  return <div className='space-y-4'>
    <PageHeader title='Integrationen' subtitle='Twitch Bot Account konfigurieren.' />
    <Card className='p-5 space-y-3 text-zinc-200'>
      <h2 className='text-lg font-semibold'>Twitch Bot Account</h2>
      <p className='text-sm text-zinc-400'>Melde dich bei Twitch mit dem separaten Bot-Account an. Dieser Account wird später im Chat antworten.</p>
      <div>Status: {data?.connected ? 'verbunden' : 'nicht verbunden'}</div>
      {data?.connected ? <>
        <div>Bot: {data.botDisplayName} ({data.botLogin})</div>
        <div>Token Expires At: {new Date(data.expiresAt).toLocaleString()}</div>
        <div>Scopes: {(data.scopes || []).join(', ')}</div>
        <div className='text-emerald-400'>StreamForge sendet im Chat als {data.botDisplayName}.</div>
        <Button onClick={async () => { await apiDelete(`/api/channels/${channelId}/twitch/bot`); await load(); }}>Bot-Account trennen</Button>
      </> : <>
        <div className='text-amber-300'>Aktuell sendet StreamForge als Broadcaster.</div>
        <a className='inline-block px-3 py-2 bg-indigo-600 rounded text-white' href={connectUrl}>Bot-Account verbinden</a>
      </>}
    </Card>
  </div>;
}
