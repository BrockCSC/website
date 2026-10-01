import { cn } from "@/lib/utils";

const WIDTH = {
  default: "max-w-[1060px]",
  narrow: "max-w-[760px]",
  wide: "max-w-[1200px]",
} as const;

const PAD_Y = { 8: "sm:py-8", 10: "sm:py-10" } as const;

/**
 * The admin page container. Gutters respect the landscape notch; at sm+
 * with no insets it equals the old `px-5 py-8`, so desktop is unchanged.
 */
export function AdminPage({
  width = "default",
  padY = 8,
  className,
  children,
}: {
  width?: keyof typeof WIDTH;
  padY?: keyof typeof PAD_Y;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full pt-4 pr-[max(1rem,env(safe-area-inset-right))] pb-6 pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))] sm:pl-[max(1.25rem,env(safe-area-inset-left))]",
        WIDTH[width],
        PAD_Y[padY],
        className,
      )}
    >
      {children}
    </div>
  );
}
