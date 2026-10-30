"use client";

import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { useExperience } from "@/components/ExperienceProvider";

export default function SessionCompletePage() {
  const router = useRouter();
  const { session, observations, busy, error, startNextSession } = useExperience();
  const resonant = observations.find((entry) => entry.reaction === "lit_up") ?? observations.find((entry) => entry.reaction === "engaged" || entry.reaction === "calm");
  if (!session) return <AppFrame><main id="main" className="border-b border-[#dce8f0] px-[5vw] py-7 pb-[54px] max-[860px]:px-0"><h1 className="mb-[22px] max-w-[11ch] font-[family-name:var(--font-sans)] text-[clamp(3.4rem,7vw,6.8rem)] font-semibold leading-none tracking-[-.05em]">No session yet.</h1><button className="inline-flex min-h-[54px] items-center gap-[9px] rounded-full bg-[#050505] px-5 py-[6px] text-[.82rem] font-semibold text-white shadow-[0_12px_25px_rgba(0,0,0,.13)] hover:bg-[#2b1740]" type="button" onClick={() => router.push("/session")}>Start a session</button></main></AppFrame>;
  return (
    <AppFrame>
      <main id="main" className="grid min-h-[75vh] items-center gap-[9vw] px-[5vw] py-[44px] lg:grid-cols-[1fr_.9fr] max-[860px]:grid-cols-1 max-[860px]:gap-[42px] max-[860px]:px-0"><section><p className="mb-[13px] text-[.68rem] font-extrabold uppercase tracking-[.13em] text-[#3f176f]">A quiet ending</p><h1 className="mb-[22px] max-w-[7ch] font-[family-name:var(--font-sans)] text-[clamp(3.4rem,7vw,6.8rem)] font-semibold leading-none tracking-[-.05em]">Something resonated.</h1><div className="border-t border-[#dce8f0] pt-[22px]">{resonant ? <><p className="mb-[13px] text-[.68rem] font-extrabold uppercase tracking-[.13em] text-[#3f176f]">What seemed to open a door</p><h2 className="mb-[18px] max-w-none font-[family-name:var(--font-sans)] text-[2.8rem] font-semibold leading-none tracking-[-.05em]">♥ {resonant.title}</h2><p>They seemed {resonant.reaction === "lit_up" ? "to light up" : resonant.reactionLabel.toLowerCase()}.</p><p className="text-[.9rem] text-[#687b8d]">We&apos;ll follow the connections around this memory next.</p></> : <><h2 className="mb-[18px] max-w-none font-[family-name:var(--font-sans)] text-[2.8rem] font-semibold leading-none tracking-[-.05em]">Every response is useful.</h2><p className="text-[.9rem] text-[#687b8d]">We can take an adjacent path next time, gently.</p></>}</div>{error ? <p className="border-l-2 border-[#bd5d68] bg-[#fff2f4] px-4 py-[13px] text-[#bd5d68]">{error}</p> : null}<div className="mt-[30px] flex flex-wrap items-center gap-[13px]"><button className="inline-flex min-h-[54px] items-center gap-[9px] rounded-full bg-[#050505] px-5 py-[6px] text-[.82rem] font-semibold text-white shadow-[0_12px_25px_rgba(0,0,0,.13)] hover:bg-[#2b1740]" type="button" disabled={busy} onClick={() => void startNextSession().then(() => router.push("/session/adapt")).catch(() => undefined)}>{busy ? "Following the thread…" : "Explore the next session ↗"}</button></div></section>
        <aside className="flex min-h-[530px] items-end rounded-[28px] bg-[linear-gradient(145deg,#f3ecff,#b27ee4)] p-[30px] text-[#3f176f] shadow-[0_20px_60px_rgba(85,37,144,.15)] max-[860px]:min-h-[420px]"><h2 className="max-w-[7ch] font-[family-name:var(--font-sans)] text-[4.6rem] font-semibold leading-none tracking-[-.05em]">{resonant?.title ?? "The thread continues."}</h2></aside>
      </main>
    </AppFrame>
  );
}
