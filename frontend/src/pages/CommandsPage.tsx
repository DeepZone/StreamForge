import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorBox from '../components/ui/ErrorBox';
import LoadingState from '../components/ui/LoadingState';
import PageHeader from '../components/ui/PageHeader';

type Role = 'viewer' | 'channel_moderator' | 'channel_admin' | 'channel_owner' | 'platform_admin' | 'system_owner';
type Command = { id: string; name: string; aliasesJson?: string; aliases?: string[]; response: string; enabled: boolean; cooldownSeconds: number; requiredRole: Role; usageCount: number };
type CommandForm = { name: string; aliases: string; response: string; enabled: boolean; cooldownSeconds: string; requiredRole: Role };

const roles: Role[] = ['viewer', 'channel_moderator', 'channel_admin', 'channel_owner', 'platform_admin', 'system_owner'];
const emptyForm: CommandForm = { name: '', aliases: '', response: '', enabled: true, cooldownSeconds: '0', requiredRole: 'viewer' };
const nameRe = /^[a-z0-9_-]{1,32}$/;

const parseAliases = (text: string) => Array.from(new Set(text.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)));

export default function CommandsPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<Command[]>([]);
  const [form, setForm] = useState<CommandForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const aliases = useMemo(() => parseAliases(form.aliases), [form.aliases]);
  const aliasError = useMemo(() => aliases.find((a) => !nameRe.test(a)), [aliases]);
  const cooldownSeconds = useMemo(() => Number(form.cooldownSeconds || 0), [form.cooldownSeconds]);

  const validation = useMemo(() => {
    if (!nameRe.test(form.name)) return 'Name muss 1-32 Zeichen haben und nur a-z, 0-9, _ oder - enthalten.';
    if (!form.response.trim()) return 'Response ist erforderlich.';
    if (form.response.length > 500) return 'Response darf maximal 500 Zeichen haben.';
    if (aliasError) return 'Mindestens ein Alias ist ungültig (a-z, 0-9, _, -, max 32).';
    if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 0 || cooldownSeconds > 86400) return 'Cooldown muss eine Ganzzahl zwischen 0 und 86400 sein.';
    return '';
  }, [form.name, form.response, aliasError, cooldownSeconds]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<Command[]>(`/api/channels/${channelId}/commands`);
      setItems(data);
    } catch (e: any) {
      setError(e?.data?.detail ?? e?.data?.error ?? 'Commands konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [channelId]);

  const save = async (evt: FormEvent) => {
    evt.preventDefault();
    setFormError('');

    if (validation) {
      setFormError(validation);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.toLowerCase(),
        aliases,
        response: form.response,
        enabled: form.enabled,
        cooldownSeconds,
        requiredRole: form.requiredRole,
      };

      if (editingId) {
        await apiPatch(`/api/channels/${channelId}/commands/${editingId}`, payload);
      } else {
        await apiPost(`/api/channels/${channelId}/commands`, payload);
      }

      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (e: any) {
      setFormError(e?.data?.detail ?? e?.data?.error ?? 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Command wirklich löschen?')) return;
    try {
      await apiDelete(`/api/channels/${channelId}/commands/${id}`);
      await load();
    } catch (e: any) {
      setError(e?.data?.detail ?? e?.data?.error ?? 'Löschen fehlgeschlagen.');
    }
  };

  const edit = (item: Command) => {
    const itemAliases = item.aliases ?? JSON.parse(item.aliasesJson || '[]');
    setEditingId(item.id);
    setForm({
      name: item.name,
      aliases: itemAliases.join(', '),
      response: item.response,
      enabled: item.enabled,
      cooldownSeconds: String(item.cooldownSeconds),
      requiredRole: item.requiredRole,
    });
    setFormError('');
  };

  return (
    <div className='space-y-4'>
      <PageHeader title='Commands' subtitle='Custom Commands sicher verwalten und live anpassen.' />
      {error && <ErrorBox message={error} />}

      <Card className='p-4'>
        <form onSubmit={save} className='grid gap-3 md:grid-cols-2'>
          <input className='rounded border border-zinc-700 bg-zinc-900 px-2 py-2' placeholder='name (ohne !)' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })} />
          <input className='rounded border border-zinc-700 bg-zinc-900 px-2 py-2' placeholder='aliases, comma-separated' value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
          <textarea className='min-h-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-2 md:col-span-2' placeholder='Response' value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} />
          <input className='rounded border border-zinc-700 bg-zinc-900 px-2 py-2' type='number' min={0} max={86400} placeholder='Cooldown Sekunden' value={form.cooldownSeconds} onChange={(e) => setForm({ ...form, cooldownSeconds: e.target.value })} />
          <select className='rounded border border-zinc-700 bg-zinc-900 px-2 py-2' value={form.requiredRole} onChange={(e) => setForm({ ...form, requiredRole: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
          <div className='flex gap-2 md:col-span-2'>
            {editingId && <Button type='button' variant='ghost' onClick={() => { setEditingId(null); setForm(emptyForm); setFormError(''); }}>Abbrechen</Button>}
            <Button disabled={saving}>{editingId ? 'Speichern' : 'Command erstellen'}</Button>
          </div>
          {formError && <div className='md:col-span-2'><ErrorBox message={formError} /></div>}
        </form>
      </Card>

      {loading ? <LoadingState label='Commands werden geladen…' /> : items.length === 0 ? <EmptyState title='Noch keine Commands' description='Lege den ersten Custom Command für deinen Channel an.' /> : <Card className='overflow-x-auto p-0'><table className='w-full text-sm'><thead><tr className='border-b border-zinc-800'><th className='p-2 text-left'>Name</th><th className='p-2 text-left'>Aliases</th><th className='p-2 text-left'>Response</th><th className='p-2'>Enabled</th><th className='p-2'>Cooldown</th><th className='p-2'>Role</th><th className='p-2'>Usage</th><th className='p-2'>Aktion</th></tr></thead><tbody>{items.map((item) => { const itemAliases = item.aliases ?? JSON.parse(item.aliasesJson || '[]'); return <tr key={item.id} className='border-t border-zinc-800'><td className='p-2'>!{item.name}</td><td className='p-2'>{itemAliases.join(', ') || '-'}</td><td className='max-w-xl truncate p-2'>{item.response}</td><td className='p-2 text-center'><input type='checkbox' checked={item.enabled} onChange={async (e) => { try { await apiPatch(`/api/channels/${channelId}/commands/${item.id}`, { enabled: e.target.checked }); await load(); } catch (err: any) { setError(err?.data?.detail ?? 'Aktualisieren fehlgeschlagen.'); } }} /></td><td className='p-2 text-center'>{item.cooldownSeconds}s</td><td className='p-2 text-center'>{item.requiredRole}</td><td className='p-2 text-center'>{item.usageCount}</td><td className='space-x-2 p-2'><Button variant='ghost' onClick={() => edit(item)}>Bearbeiten</Button><Button variant='danger' onClick={() => void remove(item.id)}>Löschen</Button></td></tr>; })}</tbody></table></Card>}
    </div>
  );
}
