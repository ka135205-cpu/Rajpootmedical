'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface SelectedCustomer {
  id: string;
  name: string;
}

export function CustomerSelector({
  selected,
  onSelect,
}: {
  selected: SelectedCustomer | null;
  onSelect: (customer: SelectedCustomer | null) => void;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SelectedCustomer[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleSearch(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone')
      .eq('is_active', true)
      .or(`name.ilike.%${value}%,phone.ilike.%${value}%`)
      .limit(8);
    setResults((data ?? []).map((c) => ({ id: c.id, name: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` })));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: newName.trim(), phone: newPhone.trim() || null })
      .select('id, name')
      .single();
    setCreating(false);
    if (!error && data) {
      onSelect({ id: data.id, name: data.name });
      setShowNewForm(false);
      setNewName('');
      setNewPhone('');
    }
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <span className="text-slate-900">{selected.name}</span>
        <button onClick={() => onSelect(null)} className="text-xs text-slate-500 hover:text-red-600">
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Walk-in customer (optional) — search name or phone"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />

      {results.length > 0 && (
        <div className="mt-1 rounded-lg border border-slate-200 bg-white">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSelect(r);
                setQuery('');
                setResults([]);
              }}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {!showNewForm ? (
        <button
          onClick={() => setShowNewForm(true)}
          className="mt-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
        >
          + New customer
        </button>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Phone"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {creating ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
}
