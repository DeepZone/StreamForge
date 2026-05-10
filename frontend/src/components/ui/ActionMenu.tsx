import { useEffect, useRef, useState } from 'react';

type ActionItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export default function ActionMenu({ items, buttonLabel = 'Aktionen' }: { items: ActionItem[]; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (evt: MouseEvent) => {
      if (!ref.current?.contains(evt.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return <div ref={ref} className='relative inline-block text-left'>
    <button className='rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm hover:bg-zinc-800' onClick={() => setOpen((x) => !x)}>{buttonLabel}</button>
    {open && <div className='absolute right-0 z-20 mt-2 min-w-56 rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl'>
      {items.length === 0 && <div className='px-2 py-1 text-sm text-zinc-400'>Keine Aktionen verfügbar</div>}
      {items.map((item) => <button key={item.label} disabled={item.disabled} onClick={() => { item.onClick(); setOpen(false); }} className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${item.destructive ? 'text-rose-300 hover:bg-rose-900/40' : 'hover:bg-zinc-800'} disabled:opacity-50`}>
        {item.label}
      </button>)}
    </div>}
  </div>;
}
