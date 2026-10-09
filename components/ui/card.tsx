import * as React from 'react';
import { cn } from './cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-surface', className)} {...props} />;
}

export function CardHeader({ title, action, className, children }: { title: React.ReactNode; action?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3', className)}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {children}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}
