import { requireUser } from '@/lib/supabase/server';
import { AppHeader } from '@/components/layout/app-header';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader email={user.email ?? ''} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
