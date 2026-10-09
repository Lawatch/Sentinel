'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { sendMagicLink, verifyCode } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export function LoginForm({ next, initialError }: { next: string | null; initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, start] = useTransition();

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {!sent ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await sendMagicLink(email, next);
              if (r.ok) setSent(true);
              else setError(r.error ?? 'Envoi impossible.');
            });
          }}
        >
          <Field label="Adresse e-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" />
          </Field>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Envoi…' : 'Recevoir le lien de connexion'}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await verifyCode(email, code);
              if (r.ok) {
                router.replace(next && next.startsWith('/') ? next : '/');
                router.refresh();
              } else setError(r.error ?? 'Code refusé.');
            });
          }}
        >
          <p className="text-sm">
            Un e-mail a été envoyé à <strong>{email}</strong> si cette adresse est autorisée. Cliquez sur son lien : il fonctionne
            aussi depuis l’application de messagerie de votre téléphone. Si l’e-mail contient un code, vous pouvez le saisir ici.
          </p>
          <Field label="Code reçu par e-mail" htmlFor="code">
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </Field>
          <Button type="submit" variant="primary" disabled={pending || code.length < 6}>
            {pending ? 'Vérification…' : 'Se connecter avec le code'}
          </Button>
          <Button type="button" variant="link" onClick={() => setSent(false)}>
            Changer d’adresse ou renvoyer
          </Button>
        </form>
      )}
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
