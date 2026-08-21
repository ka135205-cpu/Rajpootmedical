import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';

function MoreLink({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 hover:bg-slate-50"
    >
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <span className="text-slate-300">›</span>
    </Link>
  );
}

export default async function MorePage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const isOwner = permissions.canManageSettings(session.role);

  return (
    <div className="max-w-xl space-y-2">
      <h1 className="mb-3 text-lg font-semibold text-slate-900">More</h1>

      <MoreLink href="/sync-issues" label="Offline Sync Issues" description="Sales pending sync from this device" />

      {isOwner && (
        <>
          <MoreLink href="/customers" label="Customers" description="Directory and outstanding credit" />
          <MoreLink href="/suppliers" label="Suppliers" description="Directory and outstanding balances" />
          <MoreLink href="/inventory/categories" label="Categories" description="Product categories" />
          <MoreLink href="/expenses" label="Expenses" description="Rent, salaries, utilities, and more" />
          <MoreLink href="/returns" label="Returns" description="Approve or reject pending returns" />
          <MoreLink href="/reports" label="Reports" description="Sales, profit, stock, and more" />
          <MoreLink href="/users" label="Users" description="Manage cashier accounts" />
          <MoreLink href="/audit-log" label="Audit Log" description="History of sensitive changes" />
          <MoreLink href="/settings" label="Settings" description="Store info and configuration" />
        </>
      )}

      {!isOwner && (
        <p className="pt-4 text-sm text-slate-400">
          More options become available to the store owner.
        </p>
      )}
    </div>
  );
}
