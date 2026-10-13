// Ícones SVG próprios, traço uniforme (1.75), sem dependências.
const PATHS = {
  today: "M8 2v3M16 2v3M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5zM12 13.5l1.2 1.2L15.5 12.5",
  plan: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 6H6.5A1.5 1.5 0 0 0 5 7.5v12A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 17.5 6H16M8.5 11.5h7M8.5 15.5h5",
  chart: "M4 20h16M7 16v-4M12 16V8M17 16v-7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c1-3.3 3.4-5 6.5-5s5.5 1.7 6.5 5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 15.3c1.8.6 3 2.1 3.5 4.7",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  x: "M6 6l12 12M18 6L6 18",
  flame: "M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.3-5.4 3.8-7.3.3 2 1.3 3.2 2.4 3.6-.2-3.1 1.2-5.9 3.6-8.1.3 3 2.5 4.9 3.4 7 .5 1.2.8 2.4.8 3.8 0 4.1-3 7.2-7.5 7.2z",
  steps: "M7.5 14.5c-1.5 0-2.5-1.6-2.5-4S6 5.5 7.8 5.5s2.2 2.4 2 4.8-.8 4.2-2.3 4.2zM7 16.8l2.6.4-.4 2.4a1.3 1.3 0 0 1-2.6-.4zM16.5 11c1.5 0 2.5-1.6 2.5-4S18 2 16.2 2s-2.2 2.4-2 4.8.8 4.2 2.3 4.2zM17 13.3l-2.6.4.4 2.4a1.3 1.3 0 0 0 2.6-.4z",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  gauge: "M4.5 17a8 8 0 1 1 15 0M12 13l3.5-4M12 13.5a1 1 0 1 0 0-.01",
  bolt: "M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z",
  dumbbell: "M7 5v14M17 5v14M4 8v8M20 8v8M7 12h10",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 9v4.5M12 17h.01M10.3 4.3L2.6 17.6A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-2.9L13.7 4.3a2 2 0 0 0-3.4 0z",
  info: "M12 11v5.5M12 7.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  repeat: "M17 2.5l3 3-3 3M4 11.5v-1a5 5 0 0 1 5-5h11M7 21.5l-3-3 3-3M20 12.5v1a5 5 0 0 1-5 5H4",
  scale: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.5 9.5a5 5 0 0 1 7 0L13 12",
  watch: "M8 6l1-3.5h6L16 6M8 18l1 3.5h6l1-3.5M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM12 9.5V12l1.5 1",
  ring: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z",
  logo: "M12 3.5a8.5 8.5 0 1 0 8.5 8.5M12 3.5a8.5 8.5 0 0 1 8.5 8.5M12 7.5a4.5 4.5 0 1 0 4.5 4.5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className = "", strokeWidth = 1.75 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
