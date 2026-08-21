export function ComingInPhase({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        This module is built in {phase}. The navigation, layout, and role-based access
        for it are already wired up — only the screen itself is still to come.
      </p>
    </div>
  );
}
