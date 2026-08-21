'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavIcon } from './NavIcon';
import type { NavItem } from '@/lib/nav';

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // Bottom nav shows at most 5 items, per architecture §25.
  const visible = items.slice(0, 5);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
      {visible.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
              active ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            <NavIcon icon={item.icon} className="h-6 w-6" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
