import { useState } from 'react';
import type { ShippingArea } from '../types';
import { searchShippingAreas } from '../lib/api';
import { errorMessage } from '../lib/domain';
import { Field, Message } from './UI';

export function ShippingAreaPicker({ label, hint, onSelect }: {
  label: string;
  hint: string;
  onSelect: (area: ShippingArea) => void;
}) {
  const [query, setQuery] = useState('');
  const [areas, setAreas] = useState<ShippingArea[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function search() {
    if (busy)
      return;
    setBusy(true);
    setError('');
    try {
      setAreas(await searchShippingAreas(query));
    }
    catch (e) {
      setError(errorMessage(e));
      setAreas([]);
    }
    finally {
      setBusy(false);
    }
  }
  return <div className="stack">
    <div className="actions">
      <Field label={label} hint={hint}>
        <input maxLength={100} value={query} onChange={e => { setQuery(e.target.value); setAreas([]); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />
      </Field>
      <button type="button" className="button secondary" disabled={busy || query.trim().length < 2} onClick={() => void search()}>{busy ? 'Mencari…' : 'Cari lokasi'}</button>
    </div>
    <Message error={error} />
    {areas.length > 0 && <div className="stack" role="listbox" aria-label="Hasil lokasi pengiriman">
      {areas.map(area => <button type="button" className="button secondary" key={area.id} onClick={() => { onSelect(area); setAreas([]); }}>
        {area.label} · kode pos {area.postal_code || 'tidak tersedia'}
      </button>)}
    </div>}
  </div>;
}
