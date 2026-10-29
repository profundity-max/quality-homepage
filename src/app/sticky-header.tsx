"use client";

import { useEffect, useRef, useState } from "react";

export function StickyHeader({
  className,
  compactClassName,
  children,
  shrink = true,
}: {
  className: string;
  compactClassName: string;
  children: React.ReactNode;
  shrink?: boolean;
}) {
  const [compact, setCompact] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = ref.current;
    const boundary = header?.parentElement;
    if (!header || !boundary || shrink) return;
    const previous = boundary.style.getPropertyValue("--reading-header-offset");
    const update = () =>
      boundary.style.setProperty(
        "--reading-header-offset",
        `${Math.ceil(header.getBoundingClientRect().height) + 24}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(header);
    update();
    return () => {
      observer.disconnect();
      if (previous)
        boundary.style.setProperty("--reading-header-offset", previous);
      else boundary.style.removeProperty("--reading-header-offset");
    };
  }, [shrink]);

  useEffect(() => {
    const update = () => setCompact(shrink && window.scrollY > 80);
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, [shrink]);

  return (
    <header
      ref={ref}
      className={`${className} ${compact ? compactClassName : ""}`}
    >
      {children}
    </header>
  );
}
