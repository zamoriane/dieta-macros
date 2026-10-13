"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Hoje", icon: "M4 12h16M12 4v16" },
  { href: "/plano", label: "Plano", icon: "M5 5h14v14H5zM9 9h6M9 13h6" },
  { href: "/resumo", label: "Resumo", icon: "M5 19V11M12 19V5M19 19v-6" },
  { href: "/perfil", label: "Perfil", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 14.5-4 16 0" },
];

export function Nav() {
  const path = usePathname();
  if (["/login", "/privacidade", "/termos"].some((p) => path.startsWith(p))) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:top-0 md:bottom-auto md:border-b md:border-t-0">
      <div className="mx-auto flex max-w-3xl items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] md:justify-start md:gap-1 md:px-4">
        <span className="mr-6 hidden font-semibold tracking-tight md:block">Dieta Macros</span>
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 text-xs md:flex-row md:gap-2 md:rounded-lg md:text-sm ${
                active ? "text-accent font-semibold" : "text-muted hover:text-ink"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="md:h-4 md:w-4">
                <path d={l.icon} />
              </svg>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
