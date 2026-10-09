'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Columns3, LogOut, Map, Settings } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { QuickAdd } from '@/components/property/quick-add';

const NAV = [
  { href: '/', label: 'Carte et liste', icon: Map },
  { href: '/comparer', label: 'Comparateur', icon: Columns3 },
  { href: '/reglages', label: 'Réglages', icon: Settings },
];

export function AppHeader({ email }: { email: string }) {
  const path = usePathname();
  return (
    <header className="no-print sticky top-0 z-[900] border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:px-4">
        <Link href="/" className="mr-1 flex items-center gap-2 font-semibold">
          <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
            <rect width="32" height="32" rx="7" fill="var(--color-accent)" />
            <path d="M8 22V13l8-5 8 5v9h-5v-6h-6v6z" fill="var(--color-accent-fg)" />
          </svg>
          <span className="hidden sm:inline">Sentinel</span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? path === '/' : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm', active ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <QuickAdd />
        <form action="/auth/deconnexion" method="post">
          <button type="submit" title={`Se déconnecter (${email})`} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Se déconnecter">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
