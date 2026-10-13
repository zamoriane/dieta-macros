"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Hoje", icon: "today" },
  { href: "/plano", label: "Plano", icon: "plan" },
  { href: "/resumo", label: "Resumo", icon: "chart" },
  { href: "/perfil", label: "Perfil", icon: "user" },
];

const HIDDEN = ["/login", "/privacidade", "/termos"];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-on-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M12 4a8 8 0 1 0 8 8" />
          <path d="M12 8a4 4 0 1 0 4 4" opacity="0.7" />
        </svg>
      </span>
      Dieta Macros
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  if (HIDDEN.some((p) => path.startsWith(p))) return null;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Desktop / tablet largo: barra superior */}
      <header className="sticky top-0 z-40 hidden border-b border-line bg-card/90 backdrop-blur md:block">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6" aria-label="Principal">
          <Logo />
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                    isActive(l.href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-card-2 hover:text-ink"
                  }`}
                >
                  <Icon name={l.icon} size={18} />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* Telemóvel: barra inferior fixa */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Principal"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-accent-soft" : ""}`}>
                    <Icon name={l.icon} size={20} strokeWidth={active ? 2.1 : 1.75} />
                  </span>
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
