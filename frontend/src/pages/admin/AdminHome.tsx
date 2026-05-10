import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import StatCard from '../../components/ui/StatCard';
import PageHeader from '../../components/ui/PageHeader';

type Stats = { usersTotal: number; channelsTotal: number; activeChannels: number; eventSubSessions: number; channelsWithErrors: number; platformBotConnected: boolean };

export default function AdminHome(){
  const [stats,setStats]=useState<Stats>({usersTotal:0,channelsTotal:0,activeChannels:0,eventSubSessions:0,channelsWithErrors:0,platformBotConnected:false});
  useEffect(()=>{apiGet<Stats>('/api/admin/overview').then(setStats).catch(()=>undefined);},[]);
  return <div className='p-6 space-y-4'><PageHeader title='Plattformübersicht' subtitle='Zentrale Verwaltung für StreamForge.'/><div className='grid gap-3 md:grid-cols-3'><StatCard label='Benutzer gesamt' value={stats.usersTotal}/><StatCard label='Streamer/Channels' value={stats.channelsTotal}/><StatCard label='Aktive Channels' value={stats.activeChannels}/><StatCard label='EventSub Sessions' value={stats.eventSubSessions}/><StatCard label='Channels mit Fehlern' value={stats.channelsWithErrors}/><StatCard label='Plattform-Bot' value={stats.platformBotConnected?'Verbunden':'Nicht verbunden'}/></div><div className='flex gap-3 text-sm'><Link className='rounded bg-indigo-600 px-3 py-2' to='/admin/users'>Benutzer verwalten</Link><Link className='rounded bg-indigo-600 px-3 py-2' to='/admin/streamers'>Streamer verwalten</Link><Link className='rounded bg-zinc-700 px-3 py-2' to='/admin/health'>Admin Health öffnen</Link></div></div>
}
