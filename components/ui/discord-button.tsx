import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCORD_INVITE } from "@/lib/links";

type DiscordButtonProps = {
  className?: string;
};

export function DiscordButton({ className }: DiscordButtonProps) {
  return (
    <Button
      asChild
      size="lg"
      variant="primary"
      className={cn("w-full cursor-pointer sm:w-auto", className)}
    >
      <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
        Join Discord <ArrowUpRight className="ml-2" />
      </a>
    </Button>
  );
}
