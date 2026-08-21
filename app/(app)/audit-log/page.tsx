import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { AuditLogRow } from '@/components/audit/AuditLogRow';

export default async function AuditLogPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canAccessAuditLog(session.role)) redirect('/more');

  const supabase = await createClient();
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('id, table_name, record_id, action, old_data, new_data, created_at, user_id, profiles(full_name)')
    .eq('store_id', session.storeId)
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href="/more" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to More
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">Most recent 200 changes to sensitive data.</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      )}

      {!error && (!logs || logs.length === 0) ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No audit events yet.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(logs ?? []).map((log) => (
            <AuditLogRow
              key={log.id}
              userName={(log.profiles as any)?.full_name ?? 'System'}
              action={log.action}
              tableName={log.table_name}
              createdAt={log.created_at}
              oldData={log.old_data}
              newData={log.new_data}
            />
          ))}
        </div>
      )}
    </div>
  );
}
