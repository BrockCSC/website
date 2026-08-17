import { cn } from "@/lib/utils";

interface MemberBadgeProps {
  count?: string;
  className?: string;
}

export function MemberBadge({ count = "200+", className }: MemberBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[24px] border-[3px] border-line bg-brand px-4 py-2 text-brand-ink shadow-brut-sm transition-[transform,box-shadow] duration-[var(--dur)] ease-smooth hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_var(--shade)] motion-reduce:hover:translate-y-0 sm:px-6 sm:py-2.5",
        className,
      )}
    >
      <span className="font-mono font-bold text-lg tracking-tighter">
        &lt;&gt;
      </span>
      <span className="font-bold tracking-wide">{count} Members</span>
    </div>
  );
}
