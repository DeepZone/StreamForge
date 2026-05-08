import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client';

type Command = { id: string; name: string; response: string; enabled: boolean; cooldownSec: number; requiredRole: string; usageCount: number };
const emptyForm = { name: '', response: '', enabled: true, cooldownSec: 0, requiredRole: 'viewer' };

export default function CommandsPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<Command[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try { setItems(await apiGet<Command[]>(`/api/channels/${channelId}/commands`)); }
    catch (e: any) { setError(e?.data?.error ?? 'Commands konnten nicht geladen werden.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [channelId]);

  const save = async (evt: FormEvent) => {
    evt.preventDefault();
    try {
      if (editingId) await apiPatch(`/api/channels/${channelId}/commands/${editingId}`, form);
      else await apiPost(`/api/channels/${channelId}/commands`, form);
      setForm(emptyForm); setEditingId(null); await load();
    } catch (e: any) { setError(e?.data?.error ?? 'Speichern fehlgeschlagen.'); }
  };
  const edit = (item: Command) => { setEditingId(item.id); setForm({ name: item.name, response: item.response, enabled: item.enabled, cooldownSec: item.cooldownSec, requiredRole: item.requiredRole }); };
  const remove = async (id: string) => { if (!window.confirm('Command wirklich löschen?')) return; await apiDelete(`/api/channels/${channelId}/commands/${id}`); await load(); };

  return <div className='space-y-4'>
    <h1 className='text-xl font-bold'>Commands</h1>
    {loading ? <p>Lade…</p> : null}
    {error ? <p className='rounded border border-red-700 bg-red-950 p-2 text-red-300'>{error}</p> : null}
    <form onSubmit={save} className='grid md:grid-cols-5 gap-2 rounded border border-slate-700 p-3'>
      <input className='bg-slate-900 border border-slate-600 px-2 py-1' placeholder='Name' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <input className='bg-slate-900 border border-slate-600 px-2 py-1 md:col-span-2' placeholder='Response' value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} required />
      <input className='bg-slate-900 border border-slate-600 px-2 py-1' type='number' placeholder='Cooldown' value={form.cooldownSec} onChange={(e) => setForm({ ...form, cooldownSec: Number(e.target.value) })} />
      <input className='bg-slate-900 border border-slate-600 px-2 py-1' placeholder='Required Role' value={form.requiredRole} onChange={(e) => setForm({ ...form, requiredRole: e.target.value })} />
      <label className='text-sm flex items-center gap-2'><input type='checkbox' checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
      <button className='rounded bg-emerald-700 px-3 py-1'>{editingId ? 'Update' : 'Create'}</button>
    </form>
    <table className='w-full text-sm'>
      <thead><tr><th>Name</th><th>Response</th><th>Enabled</th><th>Cooldown</th><th>Required Role</th><th>UsageCount</th><th /></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id} className='border-t border-slate-800'><td>!{item.name}</td><td>{item.response}</td><td>{String(item.enabled)}</td><td>{item.cooldownSec}</td><td>{item.requiredRole}</td><td>{item.usageCount}</td><td className='space-x-2'><button className='underline' onClick={() => edit(item)}>Edit</button><button className='underline text-red-300' onClick={() => void remove(item.id)}>Delete</button></td></tr>)}</tbody>
    </table>
  </div>;
}
