import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import Link from "next/link";

interface InfoCardButtonProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  href: string;
}

export function InfoCardButton({
  icon: Icon,
  title,
  subtitle,
  href,
}: InfoCardButtonProps) {
  return (
    <Button
      asChild
      variant="outline"
      className="h-auto py-3 px-5 bg-surface flex items-center justify-start gap-4 rounded-[16px] border-2 border-line hover:bg-tint hover:-translate-y-1 shadow-[4px_4px_0_0_var(--brand)] hover:shadow-[6px_6px_0_0_var(--brand)] group"
    >
      <Link href={href}>
        <div className="p-3 bg-brand rounded-xl flex items-center justify-center shrink-0">
          <Icon className="size-6 text-brand-ink" />
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <span className="font-bold text-base text-ink">{title}</span>
          <span className="text-[13px] text-subtle font-medium">
            {subtitle}
          </span>
        </div>
      </Link>
    </Button>
  );
}
