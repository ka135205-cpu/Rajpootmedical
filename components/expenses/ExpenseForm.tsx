'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const CATEGORIES = ['Rent', 'Electricity', 'Salaries', 'Transport', 'Internet', 'Maintenance', 'Other'];

export function ExpenseForm() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0],
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: insertError } = await supabase.from('expenses').insert({
      title: form.title.trim(),
      category: form.category,
      amount: Number(form.amount),
      expense_date: form.expense_date,
      description: form.description.trim() || null,
      payment_method: 'cash',
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setForm({ title: '', category: CATEGORIES[0], amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        + Add Expense
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          placeholder="Title *"
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={form.category}
          onChange={(e) => update('category', e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          type="number"
          min={0.01}
          step="0.01"
          placeholder="Amount *"
          value={form.amount}
          onChange={(e) => update('amount', e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={form.expense_date}
          onChange={(e) => update('expense_date', e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <input
        placeholder="Description"
        value={form.description}
        onChange={(e) => update('description', e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Add Expense'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
