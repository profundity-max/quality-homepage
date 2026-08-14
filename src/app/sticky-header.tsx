"use client";

import { useEffect, useState } from "react";

export function StickyHeader({
  className,
  compactClassName,
  children,
}: {
  className: string;
  compactClassName: string;
  children: React.ReactNode;
}) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const update = () => setCompact(window.scrollY > 80);
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`${className} ${compact ? compactClassName : ""}`}>
      {children}
    </header>
  );
}
