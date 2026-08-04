import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_[data-slot=badge-icon]]:inline-flex [&_[data-slot=badge-icon]]:items-center [&_[data-slot=badge-icon]]:justify-center [&_[data-slot=badge-icon]_svg]:size-4 [&_[data-slot=badge-icon]_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-[#f3c5c5] bg-[#fff1f1] text-[#9a4440]",
        secondary: "border-transparent bg-slate-200 text-slate-900",
        destructive: "border-transparent bg-red-50 text-red-700",
        blue: "border-transparent bg-blue-50 text-blue-700",
        green: "border-transparent bg-emerald-50 text-emerald-700",
        yellow: "border-transparent bg-amber-50 text-amber-800",
        purple: "border-transparent bg-purple-50 text-purple-700",
        outline: "border-slate-300 bg-transparent text-slate-900",
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
