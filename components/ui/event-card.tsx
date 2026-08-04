import React from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight } from "lucide-react";

interface EventCardProps {
  title: string;
  description: string;
  imageUrl?: string | null;
  tags: {
    label: string;
    icon?: React.ReactNode;
  }[];
}

export function EventCard({
  title,
  description,
  imageUrl,
  tags,
}: EventCardProps) {
  return (
    <div className="w-full flex flex-col rounded-[24px] border-2 border-black bg-white p-2 shadow-[4px_4px_0_0_#9A4440] overflow-hidden h-full transform transition-transform hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#9A4440] duration-300 group/card">
      <div
        className={`relative w-full aspect-[4/3] sm:aspect-video rounded-[16px] border-2 border-black overflow-hidden flex items-center justify-center bg-neutral-900`}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-xl opacity-40 scale-110 pointer-events-none transition-transform duration-500 group-hover/card:scale-125"
            />
            <img
              src={imageUrl}
              alt={title}
              className="relative z-10 w-full h-full object-contain transition-transform duration-500 group-hover/card:scale-105"
            />
          </>
        ) : (
          <div className="flex items-center justify-center p-4">
            <div className="relative size-24 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center backdrop-blur-sm shadow-inner transition-transform duration-500 group-hover/card:scale-110">
              <div className="text-center font-bold text-white/50 uppercase tracking-widest text-xs px-2 truncate w-full">
                {title.split(" ")[0]}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 pt-5 gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-bold tracking-tight text-black line-clamp-1">
            {title}
          </h3>
          <p className="text-sm text-neutral-600 line-clamp-3 font-medium leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mt-auto pt-2">
          {tags.map((tag, index) => (
            <Badge
              key={index}
              variant="outline"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-[#f5d5d5] bg-[#fff1f1] hover:bg-[#ffeaea] text-[#9A4440] text-[10px] sm:text-xs font-bold uppercase tracking-wider"
            >
              {tag.icon && (
                <span className="[&>svg]:size-3.5 opacity-80 shrink-0">
                  {tag.icon}
                </span>
              )}
              <span className="truncate">{tag.label}</span>
            </Badge>
          ))}
        </div>

        {/* Action Button */}
        <div className="mt-2 w-full rounded-[14px] bg-[#9A4440] text-white py-3 px-4 flex items-center justify-center gap-2 font-bold border-2 border-black shadow-[2px_2px_0_0_#000] group-hover/card:bg-[#803835] transition-colors">
          More Info
          <ArrowUpRight className="size-4 opacity-80 shrink-0" />
        </div>
      </div>
    </div>
  );
}
