import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canManageExpenses(session.role)) redirect('/more');

  const { from = '', to = '' } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('expenses')
    .select('id, title, category, amount, expense_date, description')
    .eq('store_id', session.storeId)
    .order('expense_date', { ascending: false });

  if (from) query = query.gte('expense_date', from);
  if (to) query = query.lte('expense_date', to);

  const { data: expenses, error } = await query;
  const total = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/more" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to More
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Expenses</h1>
        </div>
        <ExpenseForm />
      </div>

      <form className="flex gap-2" action="/expenses">
        <input type="date" name="from" defaultValue={from} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" name="to" defaultValue={to} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Filter
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-400">Total</p>
        <p className="text-xl font-semibold text-slate-900">Rs. {total.toLocaleString()}</p>
        {byCategory.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
            {Array.from(byCategory.entries()).map(([cat, amt]) => (
              <span key={cat} className="rounded-full bg-slate-100 px-2 py-1">
                {cat}: Rs. {amt.toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </div>

      {!error && (!expenses || expenses.length === 0) ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No expenses recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(expenses ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">{e.title}</p>
                <p className="text-xs text-slate-500">
                  {e.category} · {e.expense_date}
                </p>
              </div>
              <span className="font-medium text-slate-900">Rs. {e.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
