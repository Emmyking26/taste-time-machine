"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppFrame } from "@/components/AppFrame";
import { Constellation } from "@/components/Constellation";
import { useExperience } from "@/components/ExperienceProvider";

const WAITING = ["Gathering the memories you shared", "Looking through the years they grew up in", "Listening for cultural connections"];

export default function WorldPage() {
  const router = useRouter();
  const { draft, world, busy, error, createAndReconstruct } = useExperience();
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (world || started) return;
    const memories = draft.memories.map((item) => item.trim()).filter(Boolean);
    if (!draft.name.trim() || memories.length < 3) { router.replace("/create"); return; }
    setStarted(true); void createAndReconstruct(draft).catch(() => undefined);
  }, [createAndReconstruct, draft, router, started, world]);

  useEffect(() => {
    if (!world) { setVisibleSteps(0); return; }
    setVisibleSteps(0);
    let current = 0;
    const timer = window.setInterval(() => { current += 1; setVisibleSteps(current); if (current >= world.steps.length) window.clearInterval(timer); }, 460);
    return () => window.clearInterval(timer);
  }, [world]);

  const reconstructing = Boolean(busy || (world && visibleSteps < world.steps.length));
  if (!world || reconstructing) return (
    <AppFrame>
      <main id="main" className="grid min-h-[74vh] content-center gap-[8vw] px-[5vw] py-[60px] lg:grid-cols-[.7fr_1.3fr] max-[860px]:grid-cols-1 max-[860px]:gap-[42px] max-[860px]:px-0">
        <div><p className="mb-[13px] text-[.68rem] font-extrabold uppercase tracking-[.13em] text-[#3f176f]">The archive is opening</p><h1 className="mb-[22px] max-w-[7ch] font-[family-name:var(--font-sans)] text-[clamp(3.4rem,7vw,6.8rem)] font-semibold leading-none tracking-[-.05em]">Reconstructing {draft.name ? `${draft.name.split(" ")[0]}'s world` : "their world"}</h1><p className="text-[.9rem] text-[#687b8d]">Nothing is assumed. Each thread is discovered from the fragments you shared.</p></div>
        <div><ul className="m-0 mt-[18px] grid list-none p-0">{!world ? WAITING.map((label) => <li className="flex min-h-[60px] items-center gap-4 border-b border-[#dce8f0] text-[#687b8d] opacity-50" key={label}><span className="grid h-6 w-6 place-items-center rounded-full border border-[#c3d8e5] text-[.75rem] text-white" aria-hidden="true" />{label}</li>) : world.steps.map((step, index) => <li key={step.id} className={`flex min-h-[60px] items-center gap-4 border-b border-[#dce8f0] text-[#687b8d] opacity-50 transition ${index < visibleSteps ? "translate-x-2 text-[#172433] opacity-100" : ""}`}><span className={`grid h-6 w-6 place-items-center rounded-full border border-[#c3d8e5] text-[.75rem] text-white ${index < visibleSteps ? "border-[#6f2dbd] bg-[#6f2dbd]" : ""}`} aria-hidden="true">{index < visibleSteps ? "✓" : ""}</span>{step.label}</li>)}</ul>{error ? <p className="border-l-2 border-[#bd5d68] bg-[#fff2f4] px-4 py-[13px] text-[#bd5d68]">{error}</p> : null}</div>
      </main>
    </AppFrame>
  );

  const person = world.person;
  return (
    <AppFrame>
      <main id="main">
        <section className="grid items-end gap-[8vw] border-b border-[#dce8f0] px-[5vw] py-[32px] pb-[66px] lg:grid-cols-[1.15fr_.85fr] max-[860px]:grid-cols-1 max-[860px]:gap-[42px] max-[860px]:px-0">
          <div><p className="mb-[13px] text-[.68rem] font-extrabold uppercase tracking-[.13em] text-[#3f176f]">{person.firstName}&apos;s world · reconstructed</p><h1 className="mb-[22px] max-w-[9ch] font-[family-name:var(--font-sans)] text-[clamp(3.4rem,7vw,6.8rem)] font-semibold leading-none tracking-[-.05em]">A life in threads.</h1><p className="max-w-[35rem] text-base leading-[1.65] text-[#687b8d]">A cultural constellation gathered around the memories you shared.</p></div>
          <div className="border-l-2 border-[#94d9f5] px-0 py-[5px] pl-[22px] text-[#687b8d]"><strong className="block text-[1.55rem] font-bold text-[#172433]">{person.name}</strong>{person.hometown}, {person.state}<br />{person.birthYear}<br /><br /><span className="mb-[13px] block text-[.68rem] font-extrabold uppercase tracking-[.13em] text-[#3f176f]">Formative years</span><span>{person.period.startYear}—{person.period.endYear}</span></div>
        </section>
        <section className="px-[5vw] max-[860px]:px-0">
          <div className="flex items-baseline justify-between gap-5 pt-[56px] max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-1"><h2 className="mb-[18px] max-w-none font-[family-name:var(--font-sans)] text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-none tracking-[-.05em]">The cultural world</h2><span className="text-[.72rem] font-bold uppercase tracking-[.1em] text-[#687b8d]">Living collection · {world.constellation.length} threads</span></div>
          <Constellation signals={world.constellation} hometown={person.hometown} />
          <div className="flex flex-wrap gap-[9px] border-t border-[#dce8f0] py-[30px] pb-[50px]" aria-label="Cultural signals">{world.signals.slice(0, 12).map((signal) => <span className="inline-flex items-center gap-2 rounded-full border border-[#d2e5ef] bg-white px-[13px] py-[10px] text-[.86rem] text-[#172433]" key={`${signal.group}-${signal.name}`}><small className="text-[.58rem] font-extrabold uppercase tracking-[.08em] text-[#3f176f]">{signal.origin === "remembered" ? "remembered" : "connected"}</small>{signal.name}</span>)}</div>
          <div className="mt-[30px] flex flex-wrap items-center gap-[13px]"><Link className="inline-flex min-h-[54px] items-center justify-center gap-[9px] rounded-full bg-[#050505] px-5 py-[6px] text-[.82rem] font-semibold text-white no-underline shadow-[0_12px_25px_rgba(0,0,0,.13)] hover:bg-[#2b1740]" href="/session">Enter a session ↗</Link></div>
        </section>
      </main>
    </AppFrame>
  );
}
