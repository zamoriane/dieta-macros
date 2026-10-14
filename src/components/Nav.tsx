"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";

type NavLink = { href: string; label: string; icon: IconName };

const MAIN: NavLink[] = [
  { href: "/", label: "Hoje", icon: "today" },
  { href: "/plano", label: "Plano", icon: "plan" },
  { href: "/treino", label: "Treino", icon: "dumbbell" },
  { href: "/resumo", label: "Resumo", icon: "chart" },
];
const CLIENTES: NavLink = { href: "/clientes", label: "Clientes", icon: "users" };

const HIDDEN = ["/login", "/privacidade", "/termos", "/conta-desativada"];

type Me = { nome: string | null; email: string | null; avatar: string | null; admin: boolean; trainer: boolean };

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

/** Botão do utilizador (desktop): avatar com menu — Perfil, Admin, palavra-passe, Sair. */
function UserMenu({ me, active }: { me: Me; active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-card-2";
  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conta de ${me.nome ?? me.email ?? "utilizador"}`}
        className={`flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-card-2 ${active || open ? "bg-accent-soft" : ""}`}
      >
        <Avatar name={me.nome} email={me.email} src={me.avatar} size={34} className={active ? "ring-2 ring-accent" : ""} />
        <Icon name="chevronDown" size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="anim-fade absolute right-0 top-12 z-50 w-64 rounded-2xl border border-line bg-card p-2 shadow-xl">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar name={me.nome} email={me.email} src={me.avatar} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{me.nome || "Sem nome"}</div>
              <div className="truncate text-xs text-muted">{me.email}</div>
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <Link role="menuitem" href="/perfil" className={item}>
            <Icon name="user" size={18} className="text-muted" /> Perfil e metas
          </Link>
          {me.admin && (
            <Link role="menuitem" href="/admin" className={item}>
              <Icon name="gauge" size={18} className="text-muted" /> Administração
            </Link>
          )}
          <Link role="menuitem" href="/nova-senha" className={item}>
            <Icon name="lock" size={18} className="text-muted" /> Alterar palavra-passe
          </Link>
          <div className="my-1 border-t border-line" />
          <form action="/auth/signout" method="post">
            <button role="menuitem" type="submit" className={`${item} text-bad`}>
              <Icon name="logout" size={18} /> Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const path = usePathname();
  const sb = useMemo(() => createClient(), []);
  const [me, setMe] = useState<Me | null>(null);
  const hidden = HIDDEN.some((p) => path.startsWith(p));

  useEffect(() => {
    if (hidden) return;
    const load = async () => {
      const { data: s } = await sb.auth.getSession();
      const user = s.session?.user;
      if (!user) return;
      const { data } = await sb.from("profiles").select("nome, avatar_url, role, pt_estado").eq("id", user.id).maybeSingle();
      setMe({
        nome: data?.nome ?? null,
        email: user.email ?? null,
        avatar: data?.avatar_url ?? null,
        admin: data?.role === "admin",
        trainer: data?.pt_estado === "aprovado",
      });
    };
    load();
    window.addEventListener("perfil-atualizado", load);
    return () => window.removeEventListener("perfil-atualizado", load);
  }, [sb, hidden]);

  if (hidden) return null;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const desktopLinks = me?.trainer ? [...MAIN, CLIENTES] : MAIN;
  const mobileLinks = me?.trainer ? [...MAIN, CLIENTES] : MAIN;
  const profileActive = ["/perfil", "/admin", "/nova-senha"].some((p) => path.startsWith(p));

  return (
    <>
      {/* Desktop / tablet largo: barra superior */}
      <header className="sticky top-0 z-40 hidden border-b border-line bg-card/90 backdrop-blur md:block">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6" aria-label="Principal">
          <Logo />
          <ul className="flex items-center gap-1">
            {desktopLinks.map((l) => (
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
          {me ? (
            <UserMenu me={me} active={profileActive} />
          ) : (
            <span className="ml-auto h-9 w-9 animate-pulse rounded-full bg-card-2" aria-hidden="true" />
          )}
        </nav>
      </header>

      {/* Telemóvel: barra inferior fixa; o último separador é o avatar (Perfil) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Principal"
      >
        <ul className={`mx-auto grid max-w-md ${mobileLinks.length === 5 ? "grid-cols-6" : "grid-cols-5"}`}>
          {mobileLinks.map((l) => {
            const active = isActive(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
                >
                  <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${active ? "bg-accent-soft" : ""}`}>
                    <Icon name={l.icon} size={20} strokeWidth={active ? 2.1 : 1.75} />
                  </span>
                  {l.label}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/perfil"
              aria-current={profileActive ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${profileActive ? "text-accent" : "text-muted"}`}
            >
              <span className="flex h-7 w-11 items-center justify-center">
                <Avatar name={me?.nome} email={me?.email} src={me?.avatar} size={26} className={profileActive ? "ring-2 ring-accent" : ""} />
              </span>
              Perfil
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
