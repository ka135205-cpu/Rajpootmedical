import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { getVisibleNavItems } from '@/lib/nav';
import { Sidebar } from '@/components/nav/Sidebar';
import { BottomNav } from '@/components/nav/BottomNav';
import { PwaRegistration, OfflineBanner } from '@/components/PwaRegistration';
import { LogoutButton } from '@/components/nav/LogoutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();

  if (!session) {
    redirect('/login');
  }

  const items = getVisibleNavItems(session.role);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <PwaRegistration />
      <Sidebar
        items={items}
        storeName={session.storeName}
        userName={session.fullName}
        role={session.role}
      />

      <div className="flex min-h-screen flex-1 flex-col">
        <OfflineBanner />

        {/* Mobile top bar — sidebar (with its logout button) is desktop-only,
            so identity + logout must also be reachable on mobile here. */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden print:hidden">
          <div>
            <p className="text-sm font-semibold text-slate-900">{session.storeName}</p>
            <p className="text-xs capitalize text-slate-500">{session.role}</p>
          </div>
          <LogoutButton compact />
        </header>

        <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">{children}</main>

        <BottomNav items={items} />
      </div>
    </div>
  );
}
