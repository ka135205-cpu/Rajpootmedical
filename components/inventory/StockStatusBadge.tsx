import { STATUS_LABEL, STATUS_STYLE, type StockStatus } from '@/lib/inventory/types';

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
