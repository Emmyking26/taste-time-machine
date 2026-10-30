"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/#about", label: "How it works" },
  { href: "/create", label: "Memory Profiles" },
  { href: "/sessions", label: "Sessions" },
];

export function AppFrame({
  children,
  action,
  minimal = false,
}: {
  children: ReactNode;
  action?: ReactNode;
  minimal?: boolean;
}) {
  const pathname = usePathname();
  const isSessionsPage = pathname === "/sessions";
  const shellClass = minimal
    ? "w-full max-w-none px-[5vw] pb-[70px] pt-[22px] max-[540px]:w-[calc(100%-28px)] max-[540px]:pt-4"
    : "mx-auto w-[min(1180px,calc(100%-64px))] pb-[84px] pt-[18px] max-[860px]:w-[min(calc(100%-36px),1180px)] max-[540px]:w-[min(calc(100%-28px),1260px)] max-[540px]:pt-4";
  const topbarClass = minimal
    ? "mb-[34px] flex min-h-[54px] items-center justify-between gap-6"
    : "mb-[34px] grid min-h-[54px] grid-cols-[1fr_auto_1fr] items-center gap-6 max-[860px]:grid-cols-[1fr_auto] max-[860px]:[&_.nav-links]:hidden max-[540px]:mb-[34px]";

  return (
    <div className={shellClass}>
      <header className={topbarClass}>
        <Link className={`inline-flex items-center gap-[9px] justify-self-start no-underline ${isSessionsPage ? "text-slate-100!" : "text-[#172433]!"}`} href="/">
          <svg className="h-[30px] w-[30px] max-[540px]:h-6 max-[540px]:w-6" viewBox="0 0 32 32" aria-hidden="true">
            <defs>
              <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4db8ff" />
                <stop offset="1" stopColor="#1478e0" />
              </linearGradient>
            </defs>
            <rect x="6" y="5" width="7" height="22" rx="3.5" transform="rotate(22 9.5 16)" fill="url(#bm)" />
            <path d="M23 12l1.3 3.2L27.5 16.5l-3.2 1.3L23 21l-1.3-3.2-3.2-1.3 3.2-1.3z" fill="url(#bm)" />
          </svg>
          <span className="text-[1.05rem] font-semibold tracking-[-.02em] max-[540px]:text-[.82rem]">Taste Time Machine</span>
        </Link>

        {!minimal ? (
          <nav className={`flex items-center gap-[34px] text-[.8rem] font-medium max-[860px]:hidden ${isSessionsPage ? "text-slate-400" : "text-[#6a7686]"}`} aria-label="Primary navigation">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`no-underline transition-colors ${isSessionsPage ? "hover:text-white!" : "hover:text-[#172433]!"} ${pathname === l.href ? (isSessionsPage ? "font-semibold text-white!" : "font-semibold text-[#172433]!") : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {action ??
          (!minimal ? (
            <Link className="inline-flex items-center gap-[7px] justify-self-end rounded-full bg-[#050505] px-[17px] py-[7px] text-[.78rem] font-semibold text-[#d9c49d]! no-underline shadow-[0_12px_25px_rgba(0,0,0,.13)] transition hover:bg-[#2b1740] max-[540px]:px-3 max-[540px]:text-[.7rem]" href="/create">
              Get started <span className="grid h-7 w-7 place-items-center rounded-full bg-[#d9c49d] text-[.95rem] text-[#25251f]!" aria-hidden="true">→</span>
            </Link>
          ) : null)}
      </header>
      {children}
    </div>
  );
}
