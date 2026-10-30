# Taste Time Machine — Voice-First Cultural Memory Investigation Agent

**One-line tagline:** Turn a half-remembered lyric, film, place, or family story into a cultural world worth sharing.

## The Problem & Inspiration

People often remember a feeling, a fragment of a lyric, an actor's role, or a place without remembering the exact name needed to search for it. Search engines work best when the user already knows the right keywords. A raw language model can interpret the clue, but it may confidently invent a connection when the memory is incomplete.

Taste Time Machine is inspired by reminiscence practices and intergenerational storytelling. It gives older adults, family members, and caregivers a friendly way to explore a memory together: start with whatever detail is available, recover a likely cultural anchor, and use related works and places to continue the conversation. It is a storytelling aid, not a clinical assessment or treatment tool.

## What It Does

- **Voice-first exploration:** Speak a fragment or type it into the Voice Explorer. Browser speech recognition handles transcription, and browser speech synthesis can read the agent's response aloud.
- **Clue cleanup and resolution:** An LLM removes spoken filler, repairs likely speech-recognition errors, classifies the cultural medium, and extracts candidate titles, artists, people, decades, and keywords.
- **Cultural constellation:** The investigation combines resolved entities with cross-domain connections across music, screen works, venues, food, and era cues. The result view distinguishes returned Qloo evidence from contextual suggestions.
- **Judge scenarios:** One-click caregiver, family-film, and Detroit-soul examples let reviewers try the investigation without a microphone.
- **Found Memories and keepsakes:** Investigations are saved in the browser's Found Memories archive, can be revisited, and can be exported as a printable family keepsake.
- **Adaptive reminiscence sessions:** The session engine can generate a timed cultural session from a profile, collect caregiver observations, and adapt later recommendations from that feedback.

## How We Built It & Qloo's Technological Role

The application uses two complementary engines:

1. **Voice, extraction, and reasoning agent.** The `/create` experience uses the browser Web Speech API for speech input and speech output. An OpenAI-compatible LLM client (configured for NVIDIA NIM, with supported provider fallbacks) cleans the transcript, identifies likely cultural entities, and explains the clue. A WebGPU-powered animated orb visualizes the voice experience, with runtime handling for visibility and lower-power devices.
2. **Qloo Taste Graph.** Server-side Qloo calls resolve cultural entities and retrieve metadata, tags, and affinity-based insights. The investigation uses Qloo's entity search and multi-domain taste signals to connect the lead memory to other cultural categories. Qloo's graph is described in the hackathon materials as spanning more than 250 million cultural entities.

The distinction matters: the LLM is useful for interpreting an imperfect clue, while Qloo provides a taste-graph layer for discovering and grounding cross-domain audience affinities. This lets a remembered song open paths to related screen culture and places without presenting an LLM's unsupported guess as a Qloo result. Qloo responses and fallback suggestions are labeled separately, and a local fallback keeps the experience usable when an external service is unavailable.

The main implementation areas are `app/create` and `app/sessions` for the discovery UI and archive; `app/api/investigate` and the profile/session API routes for server endpoints; `lib/investigation.ts` and `lib/llm.ts` for extraction and orchestration; `lib/qloo/` for Qloo API access; and `lib/agent/` for profile-based session generation, evaluation, and feedback adaptation.

## Challenges Overcome

- **Real-time transcription errors:** Spoken names and titles are easily distorted by accents, room noise, and speech recognition. The extraction prompt treats the transcript as noisy evidence, removes filler, and repairs likely phonetic errors before entity resolution.
- **Ambiguous cultural clues:** Lyrics and hooks can point to multiple songs. The agent returns candidate directions and a focused follow-up rather than requiring an exact search phrase at the start.
- **Cross-domain latency and sparse data:** Qloo calls are made from the server, use bounded request timeouts, and are combined with extracted cultural seeds. Sparse or failed responses can still produce a useful, clearly labeled discovery view.
- **Evidence clarity:** The interface exposes Qloo entity-resolution and affinity details while keeping unverified contextual suggestions distinct from graph evidence.

## Accomplishments & What's Next

We built a production-style discovery interface with voice interaction, a WebGPU visualizer, an interactive Qloo evidence inspector, cross-domain results, a persistent local archive, and print-ready keepsakes. The investigation has resilient fallback paths that avoid presenting unsupported matches as verified Qloo evidence.

Next, we plan to expand coverage for regional music, multilingual and accent-heavy clues, caregiver-controlled session profiles, and richer family archives. We also want to improve source-level explainability and continue developing the reminiscence toolkit for older adults and caregivers, with careful attention to accessibility and the limits of non-clinical software.

## Running the Project

Requires Node.js 20+.

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Add server-side credentials to `.env.local` for live NVIDIA NIM and Qloo requests. TypeScript can be checked with `npm run typecheck`, and a production build with `npm run build`.
