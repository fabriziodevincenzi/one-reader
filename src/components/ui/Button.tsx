import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] border text-sm font-medium tracking-[0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border-primary bg-primary px-6 text-primary-foreground hover:border-primary-hover hover:bg-primary-hover',
        outline:
          'border-border bg-transparent px-6 text-foreground hover:border-foreground hover:bg-background',
        quiet:
          'border-transparent bg-transparent px-3 text-foreground hover:bg-background',
      },
      size: {
        default: 'h-11',
        large: 'h-12 px-7 text-[0.9375rem]',
        small: 'h-9 min-h-9 px-4 text-xs',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';

    return (
      <Component
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button };
