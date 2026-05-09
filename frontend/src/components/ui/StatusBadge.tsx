import Badge from './Badge';
export default function StatusBadge({ status }: { status: string }) { const s=String(status||'unknown'); const v = s.includes('verified')||s==='connected'?'success':s.includes('failed')||s==='disconnected'?'danger':'warning'; return <Badge variant={v as any}>{s}</Badge>; }
