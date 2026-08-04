import { cn } from "@/lib/utils";

interface MemberBadgeProps {
  count?: string;
  className?: string;
}

export function MemberBadge({ count = "200+", className }: MemberBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[24px] border-[3px] border-black bg-[#9A4440] px-6 py-2.5 text-white shadow-[4px_4px_0_0_#000] transition-transform hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_#000] duration-300",
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
