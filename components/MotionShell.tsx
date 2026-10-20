"use client";

import { usePathname } from "next/navigation";

export function MotionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="forge-view">{children}</div>;
}
