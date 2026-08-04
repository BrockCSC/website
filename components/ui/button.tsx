import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        primary:
          "bg-[#9A4440] text-white border-2 border-black rounded-[16px] shadow-[3px_3px_0_0_#000] text-sm font-semibold hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#000]",
        default:
          "bg-[#9A4440] text-white border-2 border-black rounded-[16px] shadow-[3px_3px_0_0_#000] text-sm font-semibold hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#000]",
        destructive:
          "bg-[#d44b4b] text-white border-2 border-black rounded-[16px] shadow-[3px_3px_0_0_#000] text-sm font-semibold hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#000]",
        outline:
          "bg-transparent text-black border-2 border-black rounded-[16px] shadow-[3px_3px_0_0_#000] text-sm font-semibold hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#000]",
        secondary:
          "bg-[#f2f2f2] text-black border-2 border-black rounded-[16px] shadow-[3px_3px_0_0_#000] text-sm font-semibold hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#000]",
        ghost:
          "bg-transparent text-black border-2 border-black rounded-[16px] shadow-[3px_3px_0_0_#000] text-sm font-semibold hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#000]",
        link: "bg-transparent text-black border-0 !h-auto !rounded-none !px-0 !py-0 shadow-none text-sm font-semibold underline underline-offset-4 hover:opacity-80",
      },
      size: {
        default: "h-10 rounded-[16px] px-6 has-[>svg]:px-5",
        xs: "h-8 rounded-[14px] gap-1 px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 rounded-[15px] gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-11 rounded-[16px] px-7 has-[>svg]:px-6",
        icon: "size-8 rounded-[14px]",
        "icon-xs": "size-6 rounded-[12px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-[13px]",
        "icon-lg": "size-9 rounded-[15px]",
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

export { Button, buttonVariants };
