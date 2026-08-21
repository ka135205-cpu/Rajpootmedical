'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavIcon } from './NavIcon';
import type { NavItem } from '@/lib/nav';
import { LogoutButton } from './LogoutButton';

export function Sidebar({
  items,
  storeName,
  userName,
  role,
}: {
  items: NavItem[];
  storeName: string;
  userName: string;
  role: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex print:hidden">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-sm font-semibold text-slate-900">{storeName}</p>
        <p className="text-xs text-slate-500">
          {userName} · <span className="capitalize">{role}</span>
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <NavIcon icon={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
