"use client";

import { useEffect, useRef, useState } from "react";

export function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isShown, setIsShown] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || node.getBoundingClientRect().top < window.innerHeight) {
      return;
    }

    setIsShown(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }
        setIsShown(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`transition-[opacity,transform] duration-[var(--dur-slow)] ease-smooth ${
        isShown ? "" : "translate-y-3 opacity-0"
      } ${className}`}
      ref={ref}
    >
      {children}
    </div>
  );
}
