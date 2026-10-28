"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    const update = () => setCompact(shrink && window.scrollY > 80);
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, [shrink]);

  return (
    <header className={`${className} ${compact ? compactClassName : ""}`}>
      {children}
    </header>
  );
}
