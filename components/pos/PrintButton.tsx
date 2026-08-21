'use client';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 print:hidden"
    >
      Print Receipt
    </button>
  );
}
