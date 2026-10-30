"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { clearFoundMemories, formatMemoryDate, readFoundMemories, type SavedMemory } from "@/lib/found-memories";

export default function SessionsPage() {
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMemories(readFoundMemories());
    setHydrated(true);
  }, []);

  function revisit(memory: SavedMemory) {
    window.localStorage.setItem("taste_found_memory_revisit", memory.id);
    router.push("/create");
  }

  function clearHistory() {
    clearFoundMemories();
    setMemories([]);
  }

  return (
    <div className="min-h-screen bg-[#0c0914] text-slate-100">
      <AppFrame>
        <main className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-7">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-purple-300/70">Your archive</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Found memories</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">The cultural threads you have investigated, ready to revisit.</p>
            </div>
            {hydrated && memories.length > 0 ? (
              <button type="button" onClick={clearHistory} className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-300/40 hover:text-rose-200">
                Clear History
              </button>
            ) : null}
          </div>

          {!hydrated ? null : memories.length === 0 ? (
            <section className="mt-12 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-14 text-center">
              <p className="text-lg text-slate-300">No memories investigated yet. Start your first voice exploration.</p>
              <Link href="/create" className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 no-underline transition hover:bg-purple-100">
                Start exploring <span className="ml-2" aria-hidden="true">↗</span>
              </Link>
            </section>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {memories.map((memory, index) => (
                <article key={memory.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-[0_18px_55px_rgba(0,0,0,.15)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.15em] text-purple-300/70">{String(index + 1).padStart(2, "0")} <span className="mx-1 text-slate-600">·</span> {formatMemoryDate(memory.date)}</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">{memory.title}</h2>
                    </div>
                    <span className="shrink-0 rounded-full border border-purple-300/20 bg-purple-300/5 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-purple-200">{memory.category}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">{memory.subtitle}</p>
                  <blockquote className="mt-6 border-l border-purple-300/30 pl-3 text-sm leading-relaxed text-slate-300">You said: “{memory.query}”</blockquote>
                  <button type="button" onClick={() => revisit(memory)} className="mt-7 rounded-full border border-white/15 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-200 transition hover:border-purple-300/50 hover:text-purple-100">
                    Revisit <span aria-hidden="true">↗</span>
                  </button>
                </article>
              ))}
            </div>
          )}
        </main>
      </AppFrame>
    </div>
  );
}
