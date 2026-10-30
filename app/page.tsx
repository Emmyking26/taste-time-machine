"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppFrame } from "@/components/AppFrame";
import { BentoFeatures } from "@/components/BentoFeatures";

export default function HomePage() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Start line fill when timeline enters 70% of viewport
      const startTrigger = windowHeight * 0.7;
      const totalDistance = rect.height;
      const currentScroll = startTrigger - rect.top;
      const progress = Math.min(Math.max(currentScroll / totalDistance, 0), 1);

      setScrollProgress(progress * 100);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AppFrame>
      <main id="main">
        {/* ================= HERO SECTION ================= */}
        <section className="relative flex flex-col items-center overflow-hidden pt-[6px] text-center">
          <h1 className="m-0 max-w-none animate-[rise-in_.8s_.08s_ease_both] text-[clamp(2.6rem,6.2vw,4.9rem)] font-semibold leading-[1.08] tracking-[-.045em]">
            <span className="text-[#6f2dbd]">Follow the</span>{" "}
            <span className="font-[450] text-[#766f7f]">memories back.</span>
          </h1>

          <p className="mx-auto mt-[26px] max-w-[33rem] text-[.98rem] leading-[1.65] text-[#687b8d] animate-[rise-in_.8s_.16s_ease_both]">
            Speak a fragment from the past — a song, film, place, person or moment. Our agent follows the cultural connections to help you discover what you almost remember.
          </p>

          <div className="mt-[30px] flex flex-wrap items-center justify-center gap-[13px] animate-[rise-in_.8s_.24s_ease_both]">
            <Link className="inline-flex min-h-[54px] items-center justify-center gap-[9px] rounded-full bg-[#050505] py-[6px] pl-5 pr-2 text-[.82rem] font-semibold text-[#d9c49d]! no-underline shadow-[0_12px_25px_rgba(0,0,0,.13)] transition hover:-translate-y-0.5 hover:bg-[#2b1740]" href="/create">
              Create a Profile <span className="grid h-10 w-10 place-items-center rounded-full bg-[#d9c49d] text-[1.15rem] text-[#25251f]!" aria-hidden="true">→</span>
            </Link>
            <a className="inline-flex min-h-12 items-center justify-center gap-[9px] rounded-full border border-[#e2d8ed] bg-[rgba(255,255,255,.9)] px-[22px] py-3 text-[.82rem] font-semibold text-[#172433]! no-underline shadow-[0_7px_20px_rgba(85,37,144,.08)] transition hover:-translate-y-0.5 hover:border-[#c8aee2] hover:bg-white" href="#about">
              See how it works <span aria-hidden="true">→</span>
            </a>
          </div>

          {/* ================= HERO MEMORY FLOW ================= */}
          <div className="flow-container">
            <div className="flow-cards-row">
              <div className="flow-card">
                <div className="flow-icon bg-purple">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <span>Childhood Song</span>
              </div>

              <div className="flow-card">
                <div className="flow-icon bg-sky">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="3" />
                    <line x1="7" y1="2" x2="7" y2="22" />
                    <line x1="17" y1="2" x2="17" y2="22" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                  </svg>
                </div>
                <span>Favorite Movie</span>
              </div>

              <div className="flow-card flow-card-active">
                <div className="flow-icon bg-amber">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                </div>
                <span>Spoken Detail</span>
              </div>

              <div className="flow-card">
                <div className="flow-icon bg-rose">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <span>Hometown Spot</span>
              </div>

              <div className="flow-card">
                <div className="flow-icon bg-indigo">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                    <path d="M6 6h10" />
                    <path d="M6 10h7" />
                  </svg>
                </div>
                <span>Family Story</span>
              </div>
            </div>

            {/* Connecting Stream Lines */}
            <svg className="flow-lines-svg" viewBox="0 0 1000 240" fill="none" preserveAspectRatio="none">
              <defs>
                <linearGradient id="stream1" x1="0" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="60%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <linearGradient id="stream2" x1="0" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="60%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <linearGradient id="stream3" x1="0" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="50%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <linearGradient id="stream4" x1="0" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor="#fb7185" />
                  <stop offset="60%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <linearGradient id="stream5" x1="0" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="60%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>

              <path d="M 100 0 C 100 130, 485 150, 497 238" stroke="url(#stream1)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 300 0 C 300 120, 492 140, 499 238" stroke="url(#stream2)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 500 0 C 500 90, 500 160, 500 238" stroke="url(#stream3)" strokeWidth="2.8" strokeLinecap="round" />
              <path d="M 700 0 C 700 120, 508 140, 501 238" stroke="url(#stream4)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 900 0 C 900 130, 515 150, 503 238" stroke="url(#stream5)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>

            {/* Glowing Core Hub */}
            <div className="flow-core-wrap">
              <div className="flow-core-aura" />
              <div className="flow-core-tile">
                <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                  <path d="M16 3C16 10.1797 10.1797 16 3 16C10.1797 16 16 21.8203 16 29C16 21.8203 21.8203 16 29 16C21.8203 16 16 10.1797 16 3Z" fill="url(#coreGradient)" />
                  <defs>
                    <linearGradient id="coreGradient" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#fbbf24" />
                      <stop offset="0.5" stopColor="#ec4899" />
                      <stop offset="1" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <strong className="flow-core-title">Voice Explorer</strong>
            </div>
          </div>
        </section>

      
        <section id="about" className="investigate-section">
          <div className="investigate-header">
<div className="clarity-lockup">
  <div className="clarity-top-row">
    <span className="action-text">How it</span>
  </div>

  <div className="clarity-main-row">
    <div className="clarity-box">
   
      <div className="handle left-handle">
        <span className="handle-dot bottom-dot" />
      </div>

      <span className="clarity-word">works</span>

    
      <div className="handle right-handle">
        <span className="handle-dot top-dot" />
      </div>
    </div>
  </div>
</div>

<p className="investigate-sub">
              A voice-first cultural inquiry process designed to resolve imperfect, half-remembered fragments into confirmed personal discoveries.
            </p>
          </div>

          <div ref={timelineRef} className="timeline-container">
            <div className="timeline-track" />
            <div
              className="timeline-progress"
              style={{
                height: `${scrollProgress}%`,
                maxHeight: "calc(100% - 56px)"
              }}
            >
              {scrollProgress > 0 && scrollProgress < 98 && (
                <div className="timeline-tip-dot" />
              )}
            </div>

            {/* STEP 01 */}
            <div className="step-row">
              <div className="step-side left">
                <div className="step-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                </div>
                <span className="step-number">01</span>
              </div>

              <div className="step-center">
                <div className={`step-node ${scrollProgress >= 10 ? "active" : ""}`} />
              </div>

              <div className="step-side right text-side">
                <h3 className="step-heading">Speak a Fragment</h3>
                <p className="step-copy">
                  Speak or type whatever detail you almost remember—a lyric, an actor's voice, a diner on 12th Street, or a melody. Captured live with browser voice input.
                </p>
              </div>
            </div>

         
            <div className="step-row">
              <div className="step-side left text-side align-right">
                <h3 className="step-heading">Extract Cultural Clues</h3>
                <p className="step-copy">
                  The agent isolates era, geography, vocalist, setting, and mood—transparently marking uncertainty rather than treating fuzzy memories as facts.
                </p>
              </div>

              <div className="step-center">
                <div className={`step-node ${scrollProgress >= 30 ? "active" : ""}`} />
              </div>

              <div className="step-side right">
                <span className="step-number">02</span>
                <div className="step-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </div>
              </div>
            </div>

            {/* STEP 03 */}
            <div className="step-row">
              <div className="step-side left">
                <div className="step-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <circle cx="9" cy="10" r="1" fill="#334155" />
                    <circle cx="12" cy="10" r="1" fill="#334155" />
                    <circle cx="15" cy="10" r="1" fill="#334155" />
                  </svg>
                </div>
                <span className="step-number">03</span>
              </div>

              <div className="step-center">
                <div className={`step-node ${scrollProgress >= 50 ? "active" : ""}`} />
              </div>

              <div className="step-side right text-side">
                <h3 className="step-heading">Investigate & Clarify</h3>
                <p className="step-copy">
                  Powered by Qloo’s cultural knowledge graph to discover candidates. When ambiguous, it speaks one helpful follow-up question aloud to zero in.
                </p>
              </div>
            </div>

            {/* STEP 04 */}
            <div className="step-row">
              <div className="step-side left text-side align-right">
                <h3 className="step-heading">Confirm & Reconstruct</h3>
                <p className="step-copy">
                  Answer naturally, reject mismatches, or verify the hit. Confirmed discoveries are articulated aloud and woven into a visual memory thread.
                </p>
              </div>

              <div className="step-center">
                <div className={`step-node ${scrollProgress >= 70 ? "active" : ""}`} />
              </div>

              <div className="step-side right">
                <span className="step-number">04</span>
                <div className="step-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* STEP 05 */}
            <div className="step-row">
              <div className="step-side left">
                <div className="step-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  </svg>
                </div>
                <span className="step-number">05</span>
              </div>

              <div className="step-center">
                <div className={`step-node ${scrollProgress >= 90 ? "active" : ""}`} />
              </div>

              <div className="step-side right text-side">
                <h3 className="step-heading">Explore the Cultural World</h3>
                <p className="step-copy">
                  Expands outward into the surrounding era—related songs, movies, venues, and historical threads—saved forever in your personal found-memory library.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* ================= BENTO FEATURES + CTA ================= */}
        <BentoFeatures />

        {/* ================= STYLES ================= */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* Hero Memory Cards Flow */
          .flow-container {
            width: 100%;
            max-width: 860px;
            margin: 48px auto 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
          }
          .flow-cards-row {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 12px;
            position: relative;
            z-index: 3;
          }
          .flow-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 16px 8px 14px;
            background: #ffffff;
            border: 1px solid rgba(226, 232, 240, 0.95);
            border-radius: 18px;
            box-shadow: 0 10px 25px -4px rgba(112, 60, 160, 0.08);
            transition: transform 0.2s ease;
          }
          .flow-card:hover { transform: translateY(-4px); }
          .flow-card-active { border-color: #c084fc; box-shadow: 0 14px 34px -4px rgba(168, 85, 247, 0.2); }
          .flow-card span {
            font-size: 0.74rem;
            font-weight: 650;
            color: #1e293b;
            white-space: nowrap;
          }
          .flow-icon {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            display: grid;
            place-items: center;
            flex-shrink: 0;
          }
          .flow-icon svg { width: 20px !important; height: 20px !important; max-width: 20px !important; }
          .bg-purple { background: #f5eeff; color: #7c3aed; }
          .bg-sky { background: #e0f2fe; color: #0284c7; }
          .bg-amber { background: #fef3c7; color: #d97706; }
          .bg-rose { background: #ffe4e6; color: #e11d48; }
          .bg-indigo { background: #ede9fe; color: #6366f1; }
          
          .flow-lines-svg {
            width: 88%;
            height: 200px;
            margin-top: -2px;
            z-index: 1;
            pointer-events: none;
          }
          .flow-core-wrap {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-top: -4px;
            z-index: 3;
          }
         .flow-core-aura {
  display: none; /* removes the pink/purple aura behind the box */
}

.flow-core-tile {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.8);
  display: grid;
  place-items: center;
  box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.08); /* clean neutral shadow instead of purple/pink */
}

          /* How We Investigate Section */
          .investigate-section {
            width: 100%;
            padding: 80px 24px 120px;
            background: transparent !important;
            position: relative;
          }
          .investigate-header {
            max-width: 780px;
            margin: 0 auto 70px;
            text-align: center;
          }
          .investigate-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 14px;
            border-radius: 999px;
            border: 1px solid rgba(203, 213, 225, 0.6);
            background: rgba(255, 255, 255, 0.75);
            backdrop-filter: blur(8px);
            font-size: 0.68rem;
            font-weight: 700;
            letter-spacing: 0.1em;
            color: #475569;
            text-transform: uppercase;
            margin-bottom: 18px;
          }
          .investigate-badge .dot { opacity: 0.4; }
          .investigate-title {
            font-size: clamp(2.4rem, 5vw, 3.8rem);
            font-weight: 700;
            letter-spacing: -0.04em;
            color: #0f172a;
            margin: 0 0 16px;
            line-height: 1.08;
          }
          .investigate-sub {
            font-size: 1.05rem;
            color: #64748b;
            margin: 0 auto;
            max-width: 580px;
            line-height: 1.6;
          }

          /* Timeline */
          .timeline-container {
            max-width: 860px;
            margin: 0 auto;
            position: relative;
          }
          .timeline-track {
            position: absolute;
            left: 50%;
            top: 28px;
            bottom: 28px;
            width: 2px;
            background: rgba(203, 213, 225, 0.5);
            transform: translateX(-50%);
            z-index: 1;
          }
          .timeline-progress {
  position: absolute;
  left: 50%;
  top: 28px;
  width: 2.5px;
  background: #0f172a; /* solid dark black */
  transform: translateX(-50%);
  z-index: 2;
  box-shadow: none;
  transition: height 0.1s linear;
}

.timeline-tip-dot {
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #0f172a; /* black dot */
  border: 2px solid #ffffff;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
}

.step-node.active {
  background: #0f172a; /* makes active nodes fill black as the line hits them */
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 3px #0f172a;
}
          .step-row {
            display: grid;
            grid-template-columns: 1fr 44px 1fr;
            align-items: center;
            position: relative;
            z-index: 3;
            margin-bottom: 54px;
          }
          .step-row:last-child { margin-bottom: 0; }
          .step-side {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .step-side.left {
            justify-content: flex-end;
            padding-right: 16px;
          }
          .step-side.right {
            justify-content: flex-start;
            padding-left: 16px;
          }
          .step-side.text-side { display: block; }
          .step-side.align-right { text-align: right; }
          .step-icon-box {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            background: #ffffff;
            border: 1px solid rgba(226, 232, 240, 0.8);
            display: grid;
            place-items: center;
            box-shadow: 0 6px 16px rgba(100, 60, 160, 0.05);
            flex-shrink: 0;
          }
          .step-icon-box svg { width: 22px !important; height: 22px !important; max-width: 22px !important; }
          .step-number {
            font-size: 0.7rem;
            font-weight: 700;
            color: #94a3b8;
            letter-spacing: 0.06em;
            padding: 3px 8px;
            border-radius: 8px;
            background: rgba(241, 245, 249, 0.8);
          }
          .step-center { display: grid; place-items: center; }
          .step-node {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #cbd5e1;
            box-shadow: 0 0 0 3px #ffffff;
            transition: all 0.3s ease;
            z-index: 4;
          }
          .step-node.active {
            background: radial-gradient(circle,  #a855f7 60%, #121521 100%);
            border: 2px solid #ffffff
          }
          .step-heading {
            font-size: 1.1rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: #0f172a;
            margin: 0 0 6px;
          }
          .step-copy {
            font-size: 0.85rem;
            color: #64748b;
            line-height: 1.55;
            margin: 0;
            max-width: 340px;
          }
          .step-side.align-right .step-copy { margin-left: auto; }
          /* ========================================================
   IMAGE 2: ACTION CREATES CLARITY LOCKUP
======================================================== */
.clarity-lockup {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 auto 72px;
  text-align: center;
  font-family: var(--font-sans), "Plus Jakarta Sans", sans-serif;
}

/* Top Row */
.clarity-top-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 2px;
}

.speech-bubble {
  display: flex;
  align-items: center;
}

.action-text {
  font-size: clamp(1.4rem, 2.8vw, 1.9rem);
  font-weight: 800;
  color: #18181b;
  letter-spacing: -0.03em;
  line-height: 1.1;
  padding-bottom: 2px;
 
}


.clarity-main-row {
  display: inline-flex;
  align-items: center;
  position: relative;
  margin: 4px 0 10px;
}

.clarity-box {
  position: relative;
  background: #6366f1; 
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.clarity-word {
  font-size: clamp(3.8rem, 8.5vw, 6.6rem);
  font-weight: 900;
  color: #1f242e;
  letter-spacing: -0.055em;
  line-height: 0.96;
  position: relative;
  z-index: 2;
  margin-bottom: 4px;
}


.handle {
  position: absolute;
  top: -8px;
  bottom: -8px;
  width: 3.5px;
  background: #121521; 
  z-index: 3;
}

.left-handle {
  left: 0;
}

.right-handle {
  right: 0;
}

.handle-dot {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #db5591;
}

.bottom-dot {
  bottom: -6px;
}

.top-dot {
  top: -6px;
}

/* Sparkles */
.sparkles-wrap {
  position: absolute;
  left: calc(100% + 12px);
  top: 45%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sparkle-svg {
  filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.6));
}

.big-sparkle {
  width: 32px;
  height: 32px;
}

.small-sparkle {
  width: 18px;
  height: 18px;
  margin-left: 12px;
  margin-top: -6px;
}

/* Bottom Subtitle */
.clarity-subtext {
  font-size: clamp(1.15rem, 2.2vw, 1.55rem);
  font-weight: 600;
  color: #18181b;
  letter-spacing: -0.03em;
  margin: 0;
}
        `}} />

        
      </main>
    </AppFrame>
  );
}


