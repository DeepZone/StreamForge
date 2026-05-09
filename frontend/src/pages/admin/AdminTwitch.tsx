import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiBase, apiGet } from '../../api/client';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import ErrorBox from '../../components/ui/ErrorBox';

export default function AdminTwitch() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try { setData(await apiGet('/api/admin/twitch/platform-bot')); } catch (e: any) { setError(e?.data?.error ?? 'Konnte Plattform-Bot Status nicht laden.'); }
  };
  useEffect(() => { void load(); }, []);

  return <div className='space-y-4'>
    <PageHeader title='Admin · Twitch' subtitle='Globalen Plattform-Bot verwalten.' />
    {error && <ErrorBox message={error} />}
    <Card className='p-5 space-y-3'>
      <div className='text-zinc-300'>Melde dich hier mit dem Twitch-Account an, der als zentraler StreamForge-Bot in den Chats antworten soll.</div>
      <div>Plattform-Bot verbunden: <b>{data?.connected ? 'ja' : 'nein'}</b></div>
      {data?.connected && <>
        <div>Bot Login: {data.botLogin || '-'}</div>
        <div>Display Name: {data.botDisplayName || '-'}</div>
        <div>Avatar: {data.avatarUrl ? <a href={data.avatarUrl} className='text-indigo-300' target='_blank' rel='noreferrer'>anzeigen</a> : '-'}</div>
        <div>Token Expires At: {data.tokenExpiresAt ? new Date(data.tokenExpiresAt).toLocaleString() : '-'}</div>
        <div>Scopes: {(data.scopes || []).join(', ') || '-'}</div>
        <div>isActive: {String(data.isActive)}</div>
      </>}
      <div className='flex gap-2'>
        <a className='inline-block rounded-lg px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white' href={`${apiBase}/api/admin/twitch/platform-bot/start`}>Globalen Plattform-Bot verbinden</a>
        <Button variant='secondary' onClick={() => void load()}>Aktualisieren</Button>
        <Link className='px-3 py-2 rounded bg-zinc-700 text-sm' to='/admin/health'>Admin Health</Link>
      </div>
    </Card>
  </div>;
}
