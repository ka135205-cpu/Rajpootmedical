'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function ApproveReturnButtons({ returnId }: { returnId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(approve: boolean) {
    setLoading(approve ? 'approve' : 'reject');
    setError(null);

    const { error: rpcError } = await supabase.rpc('approve_return', {
      p_return_id: returnId,
      p_approve: approve,
    });

    setLoading(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <div className="flex gap-2">
        <button
          onClick={() => handle(true)}
          disabled={loading !== null}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          onClick={() => handle(false)}
          disabled={loading !== null}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
