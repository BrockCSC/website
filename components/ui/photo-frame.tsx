import Image from "next/image";
import { cn } from "@/lib/utils";

type PhotoFrameProps = {
  className?: string;
  src: string;
  alt?: string;
};

export function PhotoFrame({
  className,
  src,
  alt = "Club Photo",
}: PhotoFrameProps) {
  return (
    <div className={cn("relative w-full h-full", className)}>
      <div className="absolute inset-0 rounded-[32px] border-[3px] border-line bg-surface rotate-2 shadow-[8px_8px_0_0_var(--brand)] z-10 transition-transform duration-[var(--dur-slow)] ease-smooth hover:rotate-1 overflow-hidden group">
        <div className="w-full h-full bg-raised flex items-center justify-center p-2">
          <div className="relative w-full h-full rounded-[24px] overflow-hidden">
            <Image
              src={src}
              alt={alt}
              fill
              unoptimized
              className="object-cover transition-transform duration-[var(--dur-slow)] ease-smooth group-hover:scale-105"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
