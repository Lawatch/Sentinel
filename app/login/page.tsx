import { LoginForm } from './login-form';

export const metadata = { title: 'Connexion — Sentinel' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erreur?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Sentinel</p>
        <h1 className="mt-1 text-2xl font-semibold">Analyseur d’opportunités</h1>
        <p className="mt-1 text-sm text-muted">Dites en moins de deux minutes si une annonce mérite une visite, et à quel prix faire une offre.</p>
      </div>
      <LoginForm next={sp.next ?? null} initialError={sp.erreur ?? null} />
    </main>
  );
}
