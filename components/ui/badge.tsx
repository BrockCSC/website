import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_[data-slot=badge-icon]]:inline-flex [&_[data-slot=badge-icon]]:items-center [&_[data-slot=badge-icon]]:justify-center [&_[data-slot=badge-icon]_svg]:size-4 [&_[data-slot=badge-icon]_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-brand/35 bg-tint text-brand",
        secondary: "border-transparent bg-line/10 text-ink",
        destructive:
          "border-transparent bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
        blue: "border-transparent bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
        green:
          "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
        yellow:
          "border-transparent bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
        purple:
          "border-transparent bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-200",
        outline: "border-line/30 bg-transparent text-ink",
      },
      size: {
        default: "",
        sm: "px-2 text-[0.65rem]",
        lg: "px-3.5 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants> & {
    icon?: React.ReactNode;
    iconPosition?: "start" | "end";
  };

function Badge({
  className,
  variant,
  size,
  icon,
  iconPosition = "start",
  children,
  ...props
}: BadgeProps) {
  const iconNode = icon ? <span data-slot="badge-icon">{icon}</span> : null;
  const content =
    iconNode && iconPosition === "end" ? (
      <>
        {children}
        {iconNode}
      </>
    ) : (
      <>
        {iconNode}
        {children}
      </>
    );

  return (
    <div
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </div>
  );
}

export { Badge, badgeVariants };
