"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:block md:px-2" aria-label="Panel">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path === i.href || path.startsWith(i.href + "/");
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${active ? "bg-white/15" : "opacity-85 hover:bg-white/10"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
