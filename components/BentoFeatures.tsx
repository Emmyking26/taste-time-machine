import Link from "next/link";

/* ==========================================================================
   Taste Time Machine — Bento features + CTA
   Pure Tailwind CSS utilities only (no inline styles, no global CSS classes).
   ========================================================================== */

const SERIF = "font-[family-name:Georgia,_Times_New_Roman,_serif]!";

const LIGHT_CARD =
  "rounded-[28px] border border-purple-100/80 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-purple-200 hover:shadow-xl hover:shadow-purple-200/40";

const DARK_CARD =
  "rounded-[28px] border border-purple-950 bg-[#120d1a] p-6 text-white transition duration-300 hover:-translate-y-1 hover:border-purple-800/70 hover:shadow-2xl hover:shadow-purple-950/50";

const MEMORY_PILLS: Array<{ label: string; active?: boolean; faded?: boolean }> = [
  { label: "1966 Detroit Soul", faded: true },
  { label: "Woodward Ave Deli.map" },
  { label: "AI Cultural Resolver", active: true },
  { label: "Father’s Sunday Western.mov" },
  { label: "Family Sunday Radio.mp3", faded: true },
];

const TRANSCRIPT_LINES = [
  "…it was playing in the kitchen on Sunday mornings,",
  "something with a horn section — maybe sixty-six,",
  "my father always hummed the second verse,",
  "the old diner on Woodward had a red vinyl booth…",
];

const ARTIFACTS = [
  "The Contours discography.json",
  "Woodward Avenue historic photos.pdf",
];

/* ------------------------------- Icons ---------------------------------- */

function MusicNoteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function FilmReelIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
      <path d="M8 3.5v17M16 3.5v17M3 9h5M16 9h5M3 15h5M16 15h5" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.5c.8 4.4 3.6 7.2 8 8-4.4.8-7.2 3.6-8 8-.8-4.4-3.6-7.2-8-8 4.4-.8 7.2-3.6 8-8Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function AudioWaveIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3 w-3 shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="6" width="2" height="4" rx="1" />
      <rect x="5" y="3" width="2" height="10" rx="1" />
      <rect x="9" y="5" width="2" height="6" rx="1" />
      <rect x="13" y="7" width="2" height="2" rx="1" />
    </svg>
  );
}

/* ------------------------------ Section --------------------------------- */

export function BentoFeatures() {
  return (
    <section aria-label="Cultural memory features">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-6 py-20 md:grid-cols-12">
        {/* CARD 1 — Left tall card: proven clues */}
        <article className="flex flex-col justify-between gap-8 rounded-[32px] border border-purple-950 bg-[#120d1a] p-6 text-white transition duration-300 hover:-translate-y-1 hover:border-purple-800/70 hover:shadow-2xl hover:shadow-purple-950/50 md:col-span-4 md:row-span-2">
          {/* Memory clue mockup */}
          <div className="flex flex-col gap-2.5 rounded-2xl bg-white/95 p-4 shadow-sm">
            {MEMORY_PILLS.map((pill) => (
              <span
                key={pill.label}
                className={
                  pill.active
                    ? "rounded-full bg-slate-950 px-4 py-2 text-center text-[11px] font-semibold! !text-white ring-2 ring-purple-500/40 transition"
                    : `rounded-full border border-slate-200/70 bg-slate-50 px-4 py-2 text-center text-[11px] font-medium !text-slate-500 transition${pill.faded ? " opacity-50" : ""}`
                }
              >
                {pill.label}
              </span>
            ))}
          </div>

          {/* Copy */}
          <div className="flex flex-col gap-3">
            <h3 className={`${SERIF} text-[1.6rem]! font-normal! leading-tight! tracking-tight!`}>
              Proven Clues. Rapid Recovery.
            </h3>
            <p className="text-sm leading-relaxed text-purple-100/60">
              Complex, fuzzy memories? Resolved. Trace obscure melodies, forgotten diners, and
              classic cinema with verified cultural evidence.
            </p>
            <Link
              href="/create"
              className="mt-2 w-fit rounded-full bg-white px-5 py-2.5 text-xs font-bold! !text-slate-900 transition hover:bg-purple-100"
            >
              Start Exploring
            </Link>
          </div>
        </article>

        {/* CARD 2 — Top middle: memory domains */}
        <article className={`relative overflow-hidden ${LIGHT_CARD} flex flex-col justify-center md:col-span-4`}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-14 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.18),transparent_70%)] blur-2xl"
          />
          <h3 className="sr-only">Cultural threads we investigate</h3>
          <ul className="relative grid grid-cols-2 gap-3">
            {[
              { title: "Vinyl & Era Discography", Icon: MusicNoteIcon },
              { title: "Vintage Film & TV Archives", Icon: FilmReelIcon },
              { title: "Lost Hometown Landmarks", Icon: MapPinIcon },
              { title: "Generational Stories", Icon: SparklesIcon },
            ].map(({ title, Icon }) => (
              <li
                key={title}
                className="flex flex-col items-center gap-2.5 rounded-2xl border border-purple-100 bg-purple-50/70 px-3 py-5 text-center transition hover:border-purple-200 hover:bg-purple-100 hover:shadow-md hover:shadow-purple-200/50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-purple-700 shadow-sm ring-1 ring-purple-100">
                  <Icon />
                </span>
                <span className="text-[11px]! font-semibold! leading-snug !text-slate-700">{title}</span>
              </li>
            ))}
          </ul>
        </article>

        {/* CARD 3 — Top right: private & family-ready */}
        <article className={`flex flex-col justify-between gap-5 ${DARK_CARD} md:col-span-4`}>
          {/* 55/45 split — heading needs ~175px to stay on 2 clean lines;
              text left, result card right, vertically centered */}
          <div className="grid items-center gap-5 xl:grid-cols-[55fr_45fr]">
            <div className="min-w-0">
              <h3
                className={`${SERIF} text-xl! font-bold! leading-tight! tracking-tight! hyphens-none text-balance sm:text-2xl!`}
              >
                Private &amp; Family-Ready
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-purple-100/60">
                Turn fuzzy fragments into permanent family archives.
              </p>
            </div>

            {/* Mini export card */}
            <div className="min-w-0 rounded-xl bg-white p-4 text-xs !text-slate-900 shadow-sm">
              <p className="leading-relaxed text-slate-600">
                Confirmed Match: 1968 Detroit rhythm section with brass lead.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-[11px]! font-semibold! leading-tight! !text-slate-900 transition hover:border-purple-200 hover:bg-purple-50"
                >
                  Export (12) Artifacts
                  <DownloadIcon />
                </button>
                <button
                  type="button"
                  className="w-full rounded-full bg-slate-950 px-3 py-2 text-[11px]! font-semibold! !text-white transition hover:bg-purple-900"
                >
                  Save to Library
                </button>
              </div>
            </div>
          </div>
        </article>

        {/* CARD 4 — Bottom middle: guided by natural voice */}
        <article className={`flex flex-col justify-between gap-5 ${LIGHT_CARD} md:col-span-4`}>
          <div>
            <h3 className={`${SERIF} text-[1.5rem]! font-normal! leading-tight! tracking-tight! text-slate-900`}>
              Guided by Natural Voice
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Effortlessly investigate memories through gentle spoken prompts and conversational
              follow-ups.
            </p>
          </div>

          {/* Faded transcript + floating player tooltip */}
          <div className="relative overflow-hidden rounded-2xl border border-purple-100/60 bg-gradient-to-br from-slate-50 via-white to-purple-50/50 p-4">
            <div aria-hidden="true" className="flex select-none flex-col gap-1.5 blur-[2px]">
              {TRANSCRIPT_LINES.map((line) => (
                <p key={line} className="text-[10px] italic leading-relaxed text-slate-400/80">
                  {line}
                </p>
              ))}
              <span className="mt-1 h-2 w-4/5 rounded-full bg-slate-200/70" />
              <span className="h-2 w-3/5 rounded-full bg-slate-200/50" />
            </div>

            <div className="absolute left-1/2 top-1/2 flex max-w-[90%] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-slate-950 px-3.5 py-2 text-[10px]! font-medium! leading-snug !text-white shadow-lg shadow-purple-900/25">
              <AudioWaveIcon />
              <span>Playing: Just a Little Misunderstanding (1966)</span>
            </div>
          </div>
        </article>

        {/* CARD 5 — Bottom right: Qloo investigation */}
        <article className={`flex flex-col gap-4 ${LIGHT_CARD} md:col-span-4`}>
          <p className="text-sm leading-relaxed text-slate-700">
            Found 4 connected candidates from the 1960s Detroit music scene.
          </p>

          <Link
            href="/create"
            className="w-full rounded-xl bg-slate-950 py-3 text-center text-xs font-semibold! !text-white transition hover:bg-purple-900"
          >
            Investigate with Qloo
          </Link>

          <div>
            <h3 className="text-[11px]! font-bold! uppercase tracking-[0.12em] !text-slate-400">
              3 Saved Cultural Artifacts
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {ARTIFACTS.map((name) => (
                <li
                  key={name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/40 px-3 py-2.5 transition hover:border-purple-200 hover:bg-purple-50"
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs font-medium !text-slate-700">
                    <span className="text-purple-600">
                      <FileIcon />
                    </span>
                    <span className="truncate">{name}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Download ${name}`}
                    className="shrink-0 rounded-md p-1 !text-slate-400 transition hover:bg-white hover:text-purple-700!"
                  >
                    <DownloadIcon />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </div>

      {/* ===================== BOTTOM CTA BANNER ===================== */}
      <section
        aria-labelledby="bento-cta-heading"
        className="mx-auto mt-12 max-w-6xl rounded-[36px] border border-purple-200/60 bg-gradient-to-br from-purple-50 via-white to-purple-50/40 p-8 text-center transition duration-300 hover:shadow-xl hover:shadow-purple-200/40 sm:p-12"
      >
        <p className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/80 px-4 py-1.5 text-[11px]! font-bold! uppercase tracking-[0.14em] !text-purple-700">
          Start a gentle session
        </p>

        <h2
          id="bento-cta-heading"
          className={`mx-auto mt-6 max-w-2xl ${SERIF} text-[clamp(1.9rem,4vw,3rem)]! font-normal! leading-[1.05]! tracking-tight! text-slate-900`}
        >
          Have a memory you almost remember?
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Speak a fragment together. Follow the cultural threads. Reconnect with the songs, places,
          and stories that matter.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-7 py-3.5 text-sm font-semibold! !text-white shadow-lg shadow-purple-900/20 transition hover:-translate-y-0.5 hover:bg-purple-900"
          >
            Start a Voice Investigation <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </section>
  );
}
