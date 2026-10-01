"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scales a fixed-pixel page (a letterhead document, or a pdfjs-rendered PDF
 * page) down to fit its container, uniformly, so percentage-based field
 * coordinates stay correct at any width — the CSS transform never changes
 * the box's own coordinate space, only how large it's drawn.
 *
 * `outside` renders in the scaled box but outside the transform, so its
 * children keep their real size (44px touch targets placed by percent over a
 * page drawn at 0.4x).
 */
export function PageBox({
  width,
  height,
  children,
  outside,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
  outside?: (scale: number) => React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div className="w-full" ref={outer}>
      <div
        className="relative overflow-hidden"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          <div style={{ width, height }}>{children}</div>
        </div>
        {outside?.(scale)}
      </div>
    </div>
  );
}
