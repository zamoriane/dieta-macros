"use client";
import { useState } from "react";

/** Iniciais do primeiro e do último nome ("Rodrigo Morais" → "RM"); sem nome, a primeira letra do email. */
export function initials(name?: string | null, email?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email ?? "?").slice(0, 1).toUpperCase();
}

/** Avatar redondo: a foto, ou as iniciais sobre a cor de destaque. */
export function Avatar({
  name,
  email,
  src,
  size = 32,
  className = "",
}: {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImg = src && broken !== src;
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden="true"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" onError={() => setBroken(src)} />
      ) : (
        initials(name, email)
      )}
    </span>
  );
}
