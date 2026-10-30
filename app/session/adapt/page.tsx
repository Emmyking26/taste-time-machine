"use client";

import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { useExperience } from "@/components/ExperienceProvider";

export default function AdaptationPage() {
  const router = useRouter();
  const { session, previousSession, previousObservations } = useExperience();
  const firstMusic = previousSession?.items.find((item) => item.type === "music");
  const nextMusic = session?.items.find((item) => item.type === "music");
  const firstReaction = previousObservations.find((entry) => entry.reaction === "lit_up") ?? (firstMusic ? previousObservations.find((entry) => entry.sessionItemId === firstMusic.id) : previousObservations[0]);
  if (!session || !previousSession) return <AppFrame><main id="main" className="border-b border-[#dce8f0] px-[5vw] py-7 pb-[54px] max-[860px]:px-0"><h1 className="mb-[22px] max-w-[10ch] font-[family-name:var(--font-sans)] text-[clamp(3.4rem,7vw,6.8rem)] font-semibold leading-none tracking-[-.05em]">Complete a session first.</h1><button className="inline-flex min-h-[54px] items-center justify-center gap-[9px] rounded-full bg-[#050505] px-5 py-[6px] text-[.82rem] font-semibold text-white shadow-[0_12px_25px_rgba(0,0,0,.13)] hover:bg-[#2b1740]" type="button" onClick={() => router.push("/session")}>Start a session</button></main></AppFrame>;
  return (
    <AppFrame>
      <main id="main" className="mx-auto max-w-[1100px] px-[5vw] py-[34px] pb-20 max-[860px]:px-0">
        <p className="mb-[13px] text-[.68rem] font-extrabold uppercase tracking-[.13em] text-[#3f176f]">The archive is listening</p><h1 className="mb-[22px] max-w-[8ch] font-[family-name:var(--font-sans)] text-[clamp(3.4rem,7vw,6.8rem)] font-semibold leading-none tracking-[-.05em]">The thread changed.</h1><p className="mb-[70px] mt-7 max-w-[31rem] text-[clamp(1.5rem,3vw,2.5rem)] leading-[1.05]">We didn&apos;t simply replay the same memory.<br /><strong>We followed the thread.</strong></p>
        <div className="adapt-path relative mx-auto grid max-w-[680px] gap-0">
          <div className="relative grid grid-cols-[36px_1fr] gap-7 pb-[42px]"><span className="grid h-[35px] w-[35px] place-items-center rounded-full border border-[#b8d8e7] bg-white text-[.72rem] font-extrabold text-[#3f176f] z-[1]">01</span><div><small className="text-[.66rem] font-extrabold uppercase tracking-[.12em] text-[#3f176f]">Session one · remembered</small><strong className="mt-1 block text-[2.1rem] font-semibold">{firstMusic?.title ?? previousSession.items[0]?.title}</strong></div></div>
          <div className="relative grid grid-cols-[36px_1fr] gap-7 pb-[42px]"><span className="grid h-[35px] w-[35px] place-items-center rounded-full border border-[#b8d8e7] bg-white text-[.72rem] font-extrabold text-[#3f176f] z-[1]">♥</span><div><small className="text-[.66rem] font-extrabold uppercase tracking-[.12em] text-[#3f176f]">Your observation</small><strong className="mt-1 block text-[2.1rem] font-semibold">{firstReaction ? firstReaction.reactionLabel : "A new signal"}</strong><p className="m-0 mt-[6px] text-[#687b8d]">The system noticed what felt alive.</p></div></div>
          <div className="relative grid grid-cols-[36px_1fr] gap-7 pb-[42px]"><span className="grid h-[35px] w-[35px] place-items-center rounded-full border border-[#b8d8e7] bg-white text-[.72rem] font-extrabold text-[#3f176f] z-[1]">↗</span><div><small className="text-[.66rem] font-extrabold uppercase tracking-[.12em] text-[#3f176f]">Cultural connection</small><strong className="mt-1 block text-[2.1rem] font-semibold">{session.adaptationSummary || "An adjacent thread"}</strong><p className="m-0 mt-[6px] text-[#687b8d]">We followed an association instead of repeating the previous cue.</p></div></div>
          <div className="relative grid grid-cols-[36px_1fr] gap-7 pb-[42px]"><span className="grid h-[35px] w-[35px] place-items-center rounded-full border border-[#b8d8e7] bg-white text-[.72rem] font-extrabold text-[#3f176f] z-[1]">02</span><div><small className="text-[.66rem] font-extrabold uppercase tracking-[.12em] text-[#3f176f]">Session two · next</small><strong className="mt-1 block text-[2.1rem] font-semibold">{nextMusic?.title ?? session.items[0]?.title}</strong></div></div>
        </div>
        <div className="mt-[30px] flex flex-wrap items-center gap-[13px]"><button className="inline-flex min-h-[54px] items-center justify-center gap-[9px] rounded-full bg-[#050505] px-5 py-[6px] text-[.82rem] font-semibold text-white shadow-[0_12px_25px_rgba(0,0,0,.13)] hover:bg-[#2b1740]" type="button" onClick={() => router.push("/session/play")}>Begin session two ↗</button></div>
      </main>
    </AppFrame>
  );
}
