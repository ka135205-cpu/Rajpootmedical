'use client';

import { useState } from 'react';
import { AddBatchForm } from './AddBatchForm';

export function AddBatchSection({
  productId,
  suppliers,
}: {
  productId: string;
  suppliers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        + Add Batch
      </button>
    );
  }

  return <AddBatchForm productId={productId} suppliers={suppliers} onDone={() => setOpen(false)} />;
}
