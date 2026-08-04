import { cn } from "@/lib/utils";

interface PhotoFrameProps {
  className?: string;
  src?: string;
  alt?: string;
  children?: React.ReactNode;
}

export function PhotoFrame({
  className,
  src,
  alt = "Club Photo",
  children,
}: PhotoFrameProps) {
  return (
    <div className={cn("relative w-full h-full", className)}>
      <div className="absolute inset-0 rounded-[32px] border-[3px] border-black bg-white rotate-2 shadow-[8px_8px_0_0_#9A4440] z-10 transition-transform hover:rotate-1 duration-500 overflow-hidden group">
        <div className="w-full h-full bg-neutral-100 flex items-center justify-center p-2">
          <div className="w-full h-full rounded-[24px] overflow-hidden">
            {children ||
              (src ? (
                <img
                  src={src}
                  alt={alt}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              ) : (
                <span className="text-neutral-400 font-bold text-xl uppercase tracking-widest flex w-full h-full items-center justify-center group-hover:scale-105 transition-transform duration-700">
                  Club Photo
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
