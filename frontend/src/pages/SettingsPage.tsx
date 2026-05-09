import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPatch } from '../api/client';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import ErrorBox from '../components/ui/ErrorBox';
import LoadingState from '../components/ui/LoadingState';

export default function SettingsPage(){
  const { channelId='' } = useParams();
  const [d,setD]=useState<any>(null); const [f,setF]=useState<any>(null); const [err,setErr]=useState(''); const [ok,setOk]=useState(''); const [saving,setSaving]=useState(false);
  const load=async()=>{ const x=await apiGet(`/api/channels/${channelId}/settings`); setD(x); setF(x); };
  useEffect(()=>{ if(channelId) load().catch(()=>setErr('Settings konnten nicht geladen werden.')); },[channelId]);
  if(!d||!f) return <LoadingState label='Settings werden geladen…'/>;
  return <div className='space-y-4'><PageHeader title='Settings' subtitle='Channel-spezifische Konfigurationen.'/>{err&&<ErrorBox message={err}/>}<Card className='p-5 space-y-3'>
    <div>Channel Name: {d.displayName}</div><div>Twitch Login: {d.twitchLogin}</div>
    <label className='flex items-center gap-2'><input type='checkbox' checked={!!f.botEnabled} onChange={e=>setF({...f,botEnabled:e.target.checked})}/> Bot Enabled</label>
    <label className='flex items-center gap-2'><input type='checkbox' checked={!!f.isActive} onChange={e=>setF({...f,isActive:e.target.checked})}/> Channel Active</label>
    <Input value={f.commandPrefix||''} onChange={e=>setF({...f,commandPrefix:e.target.value})} placeholder='Command Prefix'/>
    <Select value={f.language||'de'} onChange={e=>setF({...f,language:e.target.value})}><option value='de'>Deutsch</option><option value='en'>English</option></Select>
    <Input value={f.timezone||''} onChange={e=>setF({...f,timezone:e.target.value})} placeholder='Zeitzone (z. B. Europe/Berlin)'/>
    {ok&&<div className='text-emerald-300 text-sm'>{ok}</div>}
    <Button disabled={saving} onClick={async()=>{setSaving(true);setErr('');setOk(''); try{await apiPatch(`/api/channels/${channelId}/settings`,{botEnabled:!!f.botEnabled,isActive:!!f.isActive,commandPrefix:f.commandPrefix,language:f.language,timezone:f.timezone});setOk('Gespeichert'); await load();}catch(e:any){setErr(e?.data?.errorCode||'Speichern fehlgeschlagen');}finally{setSaving(false);}}}>Save</Button>
  </Card></div>;
}
