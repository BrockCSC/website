import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const hard =
  "border-2 border-line rounded-[16px] shadow-brut-sm text-sm font-semibold hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_var(--shade)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_var(--shade)]";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        primary: `bg-brand text-brand-ink ${hard}`,
        destructive: `bg-destructive text-white ${hard}`,
        outline: `bg-transparent text-ink ${hard}`,
        secondary: `bg-raised text-ink ${hard}`,
        ghost: `bg-transparent text-ink ${hard}`,
        link: "bg-transparent text-ink border-0 !h-auto !rounded-none !px-0 !py-0 shadow-none text-sm font-semibold underline underline-offset-4 hover:opacity-80",
      },
      size: {
        default: "h-10 rounded-[16px] px-6 has-[>svg]:px-5",
        xs: "h-8 rounded-[14px] gap-1 px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 rounded-[15px] gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-11 rounded-[16px] px-7 has-[>svg]:px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
