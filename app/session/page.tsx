"use client";

import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { useExperience } from "@/components/ExperienceProvider";

const ITEMS = [["♫", "Music"], ["▣", "Something to watch"], ["⌂", "A cultural cue"], ["○", "Conversation"]];

export default function StartSessionPage() {
  const router = useRouter();
  const { world, busy, error, startSession } = useExperience();
  if (!world) return <AppFrame><main id="main" className="border-b border-[#dce8f0] px-[5vw] py-7 pb-[54px] max-[860px]:px-0"><p className="mb-[13px] text-[.68rem] font-extrabold uppercase tracking-[.13em] text-[#3f176f]">Memory library</p><h1 className="mb-[22px] max-w-[11ch] font-[family-name:var(--font-sans)] text-[clamp(3.4rem,7vw,6.8rem)] font-semibold leading-none tracking-[-.05em]">Create a profile first.</h1><button className="inline-flex min-h-[54px] items-center gap-[9px] rounded-full bg-[#050505] px-5 py-[6px] text-[.82rem] font-semibold text-white shadow-[0_12px_25px_rgba(0,0,0,.13)] hover:bg-[#2b1740]" type="button" onClick={() => router.push("/create")}>Start here ↗</button></main></AppFrame>;
  return (
    <AppFrame>
      <main id="main" className="grid min-h-[68vh] items-center gap-[10vw] px-[5vw] py-[45px] lg:grid-cols-[1fr_.8fr] max-[860px]:grid-cols-1 max-[860px]:gap-[42px] max-[860px]:px-0"><section><p className="mb-[13px] text-[.68rem] font-extrabold uppercase tracking-[.13em] text-[#3f176f]">A short visit into {world.person.firstName}&apos;s world</p><h1 className="mb-[22px] max-w-[8ch] font-[family-name:var(--font-sans)] text-[clamp(3.4rem,7vw,6.8rem)] font-semibold leading-none tracking-[-.05em]">Follow the thread.</h1><p className="max-w-[35rem] text-base leading-[1.65] text-[#687b8d]">A gentle 20-minute sequence of music, places, images and conversation. Pause or stop at any time.</p><div className="mt-7 grid border-t border-[#dce8f0]">{ITEMS.map(([icon, label]) => <div className="flex items-center gap-[18px] border-b border-[#dce8f0] py-4 text-[#687b8d]" key={label}><span className="w-[30px] text-[1.2rem] text-[#6f2dbd]" aria-hidden="true">{icon}</span>{label}</div>)}</div>{error ? <p className="border-l-2 border-[#bd5d68] bg-[#fff2f4] px-4 py-[13px] text-[#bd5d68]">{error}</p> : null}<div className="mt-[30px] flex flex-wrap items-center gap-[13px]"><button className="inline-flex min-h-[54px] items-center gap-[9px] rounded-full bg-[#050505] px-5 py-[6px] text-[.82rem] font-semibold text-white shadow-[0_12px_25px_rgba(0,0,0,.13)] hover:bg-[#2b1740]" type="button" disabled={busy} onClick={() => void startSession().then(() => router.push("/session/play")).catch(() => undefined)}>{busy ? "Opening the archive…" : "Begin session ↗"}</button></div></section>
        <aside className="flex min-h-[430px] flex-col justify-between rounded-[28px] bg-[linear-gradient(145deg,#f3ecff,#b27ee4)] p-[30px] text-[#3f176f] shadow-[0_20px_60px_rgba(85,37,144,.15)] max-[860px]:min-h-[420px]"><small className="text-[.68rem] font-extrabold uppercase tracking-[.12em]">Session 01 · {world.person.firstName}</small><h2 className="max-w-[8ch] font-[family-name:var(--font-sans)] text-[3.7rem] font-semibold leading-none tracking-[-.05em]">Notice what lights up.</h2><small className="text-[.68rem] font-extrabold uppercase tracking-[.12em]">Music · memory · connection</small></aside>
      </main>
    </AppFrame>
  );
}
