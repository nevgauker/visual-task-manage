"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

export default function GlobalUserButton() {
  const pathname = usePathname();
  if (pathname?.startsWith("/sign-in") || pathname?.startsWith("/sign-up")) {
    return null;
  }

  return (
    <div className="fixed left-4 top-4 z-40">
      <UserButton />
    </div>
  );
}
