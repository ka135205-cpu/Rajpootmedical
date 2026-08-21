'use client';

import { useState } from 'react';

const TABLE_LABEL: Record<string, string> = {
  products: 'a product',
  product_batches: 'a stock batch',
  sales: 'a sale',
  purchases: 'a purchase',
  customers: 'a customer',
  suppliers: 'a supplier',
  expenses: 'an expense',
  user_roles: 'a user role',
  store_settings: 'store settings',
};

export function AuditLogRow({
  userName,
  action,
  tableName,
  createdAt,
  oldData,
  newData,
}: {
  userName: string;
  action: 'insert' | 'update' | 'delete';
  tableName: string;
  createdAt: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(false);

  const verb = action === 'insert' ? 'created' : action === 'update' ? 'updated' : 'deleted';
  const subject = TABLE_LABEL[tableName] ?? tableName;

  return (
    <div className="px-4 py-3 text-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-slate-900">
          <span className="font-medium">{userName}</span> {verb} {subject}
        </span>
        <span className="text-xs text-slate-400">{new Date(createdAt).toLocaleString()}</span>
      </button>

      {open && (
        <div className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
          {oldData && (
            <div>
              <p className="mb-1 font-medium text-slate-500">Before</p>
              <pre className="overflow-x-auto whitespace-pre-wrap text-slate-600">
                {JSON.stringify(oldData, null, 2)}
              </pre>
            </div>
          )}
          {newData && (
            <div>
              <p className="mb-1 font-medium text-slate-500">After</p>
              <pre className="overflow-x-auto whitespace-pre-wrap text-slate-600">
                {JSON.stringify(newData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
