'use client';

import { Popover as P } from 'radix-ui';
import * as React from 'react';
import { cn } from './cn';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({ className, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={6}
        collisionPadding={12}
        className={cn('z-[1002] w-[min(26rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-surface p-3 text-sm shadow-xl', className)}
        {...props}
      />
    </P.Portal>
  );
}
