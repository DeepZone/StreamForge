import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client';

type Timer = { id: string; name: string; message: string; intervalMinutes: number; enabled: boolean };
const emptyForm = { name: '', message: '', intervalMinutes: 10, enabled: true };

export default function TimersPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<Timer[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try { setItems(await apiGet<Timer[]>(`/api/channels/${channelId}/timers`)); }
    catch (e: any) { setError(e?.data?.error ?? 'Timer konnten nicht geladen werden.'); }
  };
  useEffect(() => { void load(); }, [channelId]);

  const save = async (evt: FormEvent) => {
    evt.preventDefault();
    if (editingId) await apiPatch(`/api/channels/${channelId}/timers/${editingId}`, form);
    else await apiPost(`/api/channels/${channelId}/timers`, form);
    setForm(emptyForm); setEditingId(null); await load();
  };

  return <div className='space-y-4'>
    <h1 className='text-xl font-bold'>Timer</h1>
    {error ? <p className='rounded border border-red-700 bg-red-950 p-2 text-red-300'>{error}</p> : null}
    <form onSubmit={save} className='grid md:grid-cols-4 gap-2 rounded border border-slate-700 p-3'>
      <input className='bg-slate-900 border border-slate-600 px-2 py-1' placeholder='Name' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <input className='bg-slate-900 border border-slate-600 px-2 py-1' placeholder='Message' value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
      <input className='bg-slate-900 border border-slate-600 px-2 py-1' type='number' placeholder='Intervall Minuten' value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })} required />
      <label className='text-sm flex items-center gap-2'><input type='checkbox' checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
      <button className='rounded bg-emerald-700 px-3 py-1'>{editingId ? 'Update' : 'Create'}</button>
    </form>
    {items.length === 0 ? <p>Noch keine Timer.</p> : <table className='w-full text-sm'><thead><tr><th>Name</th><th>Message</th><th>Interval</th><th>Enabled</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id} className='border-t border-slate-800'><td>{item.name}</td><td>{item.message}</td><td>{item.intervalMinutes}</td><td><input type='checkbox' checked={item.enabled} onChange={async (e) => { await apiPatch(`/api/channels/${channelId}/timers/${item.id}`, { ...item, enabled: e.target.checked }); await load(); }} /></td><td><button className='underline' onClick={() => { setEditingId(item.id); setForm(item); }}>Edit</button> <button className='underline text-red-300' onClick={async () => { if (!window.confirm('Timer löschen?')) return; await apiDelete(`/api/channels/${channelId}/timers/${item.id}`); await load(); }}>Delete</button></td></tr>)}</tbody></table>}
  </div>;
}
