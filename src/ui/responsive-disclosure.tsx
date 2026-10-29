"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** One semantic disclosure, expanded on desktop and initially compact on mobile. */
export function ResponsiveDisclosure({
  summary,
  className,
  children,
}: {
  summary: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      if (ref.current) ref.current.open = !media.matches;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return (
    <details ref={ref} className={className} open>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
