"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Camera, Settings, Sun, type LucideIcon } from "lucide-react";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/scan", label: "Scan", icon: Camera },
  { href: "/words", label: "Words", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function TabBar() {
  return <TabBarView pathname={usePathname()} />;
}

// Rendered without a pathname as the prerendered fallback, then highlighted once it's known.
export function TabBarView({ pathname }: { pathname: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((tab) => {
          const active = pathname !== null && (tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href));
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] ${active ? "text-accent" : "text-muted"}`}
              >
                <tab.icon className="size-6" strokeWidth={1.6} aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
