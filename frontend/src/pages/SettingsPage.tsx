import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPatch } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ErrorBox from '../components/ui/ErrorBox';
import Input from '../components/ui/Input';
import LoadingState from '../components/ui/LoadingState';
import PageHeader from '../components/ui/PageHeader';
import Select from '../components/ui/Select';

export default function SettingsPage(){const {channelId=''}=useParams(); const [d,setD]=useState<any>(null); const [f,setF]=useState<any>(null); const [err,setErr]=useState(''); const [ok,setOk]=useState(''); const [saving,setSaving]=useState(false);
const load=async()=>{ const x=await apiGet(`/api/channels/${channelId}/settings`); setD(x); setF(x); }; useEffect(()=>{ if(channelId) void load().catch(()=>setErr('Settings konnten nicht geladen werden.')); },[channelId]);
if(!d||!f) return <LoadingState label='Settings werden geladen…'/>;
const save=async()=>{ if((f.commandPrefix||'').length<1 || (f.commandPrefix||'').length>5){setErr('commandPrefix muss 1 bis 5 Zeichen haben.'); return;} if(!(f.timezone||'').trim()){setErr('timezone darf nicht leer sein.'); return;} setSaving(true);setErr('');setOk(''); try{await apiPatch(`/api/channels/${channelId}/settings`,{botEnabled:!!f.botEnabled,isActive:!!f.isActive,commandPrefix:f.commandPrefix,language:f.language,timezone:f.timezone});setOk('Gespeichert'); await load();}catch(e:any){setErr(e?.data?.errorCode||'Speichern fehlgeschlagen');}finally{setSaving(false);} };
return <div className='space-y-4'><PageHeader title='Settings' subtitle='Channel-Konfiguration für Bot und Standardwerte.'/>{err&&<ErrorBox message={err}/>}{ok&&<div className='text-emerald-300 text-sm'>{ok}</div>}<Card className='p-5 space-y-3'><h2 className='font-semibold'>Channel</h2><div>Display Name: {d.displayName||'-'}</div><div>Twitch Login: {d.twitchLogin||'-'}</div><div>Twitch Channel ID: {d.twitchChannelId||'-'}</div></Card><Card className='p-5 space-y-3'><h2 className='font-semibold'>Bot Einstellungen</h2><label className='flex items-center gap-2'><input type='checkbox' checked={!!f.botEnabled} onChange={e=>setF({...f,botEnabled:e.target.checked})}/> Bot Enabled</label><label className='flex items-center gap-2'><input type='checkbox' checked={!!f.isActive} onChange={e=>setF({...f,isActive:e.target.checked})}/> Channel Active</label><label>Command Prefix<Input value={f.commandPrefix||''} onChange={e=>setF({...f,commandPrefix:e.target.value})}/></label><label>Sprache<Select value={f.language||'de'} onChange={e=>setF({...f,language:e.target.value})}><option value='de'>Deutsch</option><option value='en'>English</option></Select></label><label>Zeitzone<Input value={f.timezone||''} onChange={e=>setF({...f,timezone:e.target.value})}/></label><Button disabled={saving} onClick={()=>void save()}>Save</Button></Card></div>; }
