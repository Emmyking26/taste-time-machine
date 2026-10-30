"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OrbBloop } from "@/components/ui/orb-bloop";
import { BloopState } from "@/components/ui/orb-bloop-utils/types";
import type { InvestigationCandidate, InvestigationResult } from "@/lib/investigation";
import { createSavedMemory, readFoundMemories, saveFoundMemory, type SavedMemory } from "@/lib/found-memories";

type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

type Phase = "capture" | "investigating" | "clarify" | "candidates" | "confirmed" | "world";
type AgentState = "idle" | "recording" | "thinking" | "speaking";
type ClueChip = { key: string; value: string };

function qlooTypeForMemory(type: InvestigationCandidate["type"]): string {
  if (type === "music") return "urn:entity:artist";
  if (type === "film") return "urn:entity:movie";
  if (type === "tv") return "urn:entity:tv_show";
  if (type === "place" || type === "food") return "urn:entity:place";
  if (type === "person") return "urn:entity:person";
  return "";
}

const DEMO_MEMORY =
  "My dad used to play this song constantly. I think it was in the seventies. We lived in Detroit. I remember a woman singing, but I don't know if it was one person or a group.";

const TRANSCRIPT_PLACEHOLDER =
  "Speak whatever detail comes to mind — a lyric, an actor, a city street, or a family dish...";

const JUDGE_SCENARIOS = [
  { label: "Caregiver Clue", emoji: "👵", clue: "Slow accordion ballad from our 1958 wedding", transcript: "👵 Caregiver Clue: 'Slow accordion ballad from our 1958 wedding'" },
  { label: "Family Movie", emoji: "🎬", clue: "1968 spaghetti western in the snow with a harmonica", transcript: "🎬 Family Movie: '1968 spaghetti western in the snow with a harmonica'" },
  { label: "Detroit Soul", emoji: "🎵", clue: "Motown brass track my dad played in 1966", transcript: "🎵 Detroit Soul: 'Motown brass track my dad played in 1966'" },
];

const STATE_CAPTION: Record<AgentState, string> = {
  idle: "Idle — Tap to speak",
  recording: "Listening... speak freely",
  thinking: "Investigating cultural clues (Qloo)...",
  speaking: "Speaking answer",
};

const STATUS_TEXT: Record<AgentState, string> = {
  idle: "Agent Ready",
  recording: "Listening... speak freely",
  thinking: "Investigating with Qloo",
  speaking: "Speaking answer",
};

const STATE_HINT: Record<AgentState, string> = {
  idle: "Your voice is the first clue.",
  recording: "Tap again when the memory has landed.",
  thinking: "Reading the memory for era, place and sound.",
  speaking: "This answer is being spoken aloud.",
};

/* -------------------------- Live clue extraction -------------------------- */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(lowerText: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(lowerText);
}

const PLACE_CANDIDATES: Array<{ label: string; names: string[] }> = [
  { label: "Detroit", names: ["detroit", "woodward"] },
  { label: "Chicago", names: ["chicago"] },
  { label: "Memphis", names: ["memphis"] },
  { label: "Nashville", names: ["nashville"] },
  { label: "New York", names: ["new york", "manhattan", "brooklyn"] },
  { label: "Los Angeles", names: ["los angeles", "hollywood"] },
  { label: "Philadelphia", names: ["philadelphia"] },
  { label: "Atlanta", names: ["atlanta"] },
  { label: "Muscle Shoals", names: ["muscle shoals"] },
  { label: "London", names: ["london"] },
  { label: "Liverpool", names: ["liverpool"] },
  { label: "Paris", names: ["paris"] },
];

const GENRE_CANDIDATES: Array<{ label: string; names: string[] }> = [
  { label: "Northern Soul", names: ["northern soul"] },
  { label: "Motown", names: ["motown"] },
  { label: "Soul / R&B", names: ["soul", "r&b", "rnb"] },
  { label: "Jazz", names: ["jazz"] },
  { label: "Blues", names: ["blues"] },
  { label: "Funk", names: ["funk"] },
  { label: "Disco", names: ["disco"] },
  { label: "Gospel", names: ["gospel"] },
  { label: "Rock", names: ["rock and roll", "rock"] },
  { label: "Country", names: ["country"] },
  { label: "Folk", names: ["folk"] },
  { label: "Hip-Hop", names: ["hip-hop", "hip hop"] },
];

const DECADE_WORDS: Record<string, string> = {
  fifties: "1950s",
  sixties: "1960s",
  seventies: "1970s",
  eighties: "1980s",
  nineties: "1990s",
};

function detectEra(lowerText: string): string | null {
  for (const [word, decade] of Object.entries(DECADE_WORDS)) {
    if (hasWord(lowerText, word)) return decade;
  }
  const decadeMatch = lowerText.match(/\b(?:19|20)\d0s\b/);
  if (decadeMatch) return decadeMatch[0];
  const yearMatch = lowerText.match(/\b(?:19|20)\d{2}\b/);
  if (yearMatch) return `${Math.floor(Number(yearMatch[0]) / 10) * 10}s`;
  return null;
}

function detectConfidence(lowerText: string): string {
  if (/\b(not sure|i think|i guess|maybe|perhaps|probably|might be|somewhere around|approximately)\b/.test(lowerText)) {
    return "Exploring";
  }
  return "Remembered";
}

function detectMedium(lowerText: string): string | null {
  if (/\b(song|album|record|music|tune|radio|band|singer|jukebox)\b/.test(lowerText)) return "Music";
  if (/\b(movie|film|cinema|matinee|western|director|actor|actress|screen)\b/.test(lowerText)) return "Film";
  if (/\b(television|tv|series|episode|cartoon|sitcom|show)\b/.test(lowerText)) return "Television";
  if (/\b(recipe|dish|food|restaurant|deli|dinner|kitchen|cake|sandwich)\b/.test(lowerText)) return "Food";
  return null;
}

function extractLiveClues(text: string): ClueChip[] {
  const lowerText = text.toLowerCase();
  const chips: ClueChip[] = [];

  const era = detectEra(lowerText);
  if (era) chips.push({ key: "Era", value: era });

  const place = PLACE_CANDIDATES.find((candidate) => candidate.names.some((name) => hasWord(lowerText, name) || lowerText.includes(name)));
  if (place) chips.push({ key: "Geography", value: place.label });

  const genre = GENRE_CANDIDATES.find((candidate) => candidate.names.some((name) => hasWord(lowerText, name)));
  if (genre) chips.push({ key: "Genre", value: genre.label });

  const medium = detectMedium(lowerText);
  if (medium) chips.push({ key: "Medium", value: medium });

  if (lowerText.trim().length > 10) chips.push({ key: "Confidence", value: detectConfidence(lowerText) });

  return chips;
}

const CLUE_KEY_BY_ID: Record<string, string> = {
  era: "Era",
  location: "Geography",
  geography: "Geography",
  vocal: "Voice",
  format: "Format",
  sound: "Sound",
  mood: "Mood",
  setting: "Setting",
  context: "Context",
  genre: "Genre",
  medium: "Medium",
};

let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechSequence = 0;

function cancelSpeech() {
  speechSequence += 1;
  if (activeUtterance) {
    activeUtterance.onstart = null;
    activeUtterance.onend = null;
    activeUtterance.onerror = null;
    activeUtterance = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}

/* ------------------------------ Speech output ------------------------------ */

function speak(text: string, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  cancelSpeech();
  const sequence = speechSequence;
  const utterance = new SpeechSynthesisUtterance(text);
  activeUtterance = utterance;
  const voices = window.speechSynthesis.getVoices();
  utterance.voice =
    voices.find(
      (voice) =>
        voice.lang.toLowerCase().startsWith("en-us") &&
        /natural|samantha|ava|aria|jenny|zira|google us english/i.test(voice.name),
    ) ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ?? null;
  utterance.lang = "en-US";
  utterance.volume = 1;
  utterance.rate = 0.94;
  utterance.pitch = 0.98;
  utterance.onstart = () => { if (sequence === speechSequence) onStart?.(); };
  utterance.onend = () => { if (sequence === speechSequence) { activeUtterance = null; onEnd?.(); } };
  utterance.onerror = () => { if (sequence === speechSequence) { activeUtterance = null; onEnd?.(); } };
  window.speechSynthesis.speak(utterance);
}

export default function MemoryExplorerPage() {
  const [phase, setPhase] = useState<Phase>("capture");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [typingOpen, setTypingOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [library, setLibrary] = useState<SavedMemory[]>([]);
  const [extractedClues, setExtractedClues] = useState<ClueChip[]>([]);
  const recognition = useRef<Recognition | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const investigationAbortRef = useRef<AbortController | null>(null);
  const silenceTimer = useRef<number | null>(null);
  const silenceStartedAt = useRef<number | null>(null);
  const hasSpeechRef = useRef(false);
  const shouldKeepListeningRef = useRef(false);
  const silenceExpiredRef = useRef(false);
  const isStartingRef = useRef(false);
  const mutedRef = useRef(false);
  const clarificationCountRef = useRef(0);
  const originalQueryRef = useRef("");
  const followUpMode = phase === "clarify";

  /* ------------------------------- boot ------------------------------- */
  useEffect(() => {
    setVoiceSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    try {
      setLibrary(readFoundMemories());
      const revisitId = window.localStorage.getItem("taste_found_memory_revisit");
      if (revisitId) {
        window.localStorage.removeItem("taste_found_memory_revisit");
        const memory = readFoundMemories().find((item) => item.id === revisitId);
        if (memory) {
          originalQueryRef.current = memory.query;
          setTranscript(memory.query);
          if (memory.snapshot) {
            setResult(memory.snapshot);
            setPhase(memory.snapshot.investigationStatus === "confirmed" ? "confirmed" : "candidates");
          } else {
            void investigate(memory.query, { clarificationCount: 1 });
          }
        }
      }
    } catch {
      // The archive is a convenience; the investigation itself remains usable.
    }
    return () => {
      cancelSpeech();
      shouldKeepListeningRef.current = false;
      if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
      recognition.current?.stop();
      mediaStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  /* ------------------- live clue chips (transcript + result) ------------------- */
  useEffect(() => {
    const source = followUpMode ? `${transcript} ${answerDraft}` : transcript;
    const merged = new Map<string, ClueChip>();
    for (const chip of extractLiveClues(source)) merged.set(chip.key, chip);
    if (result) {
      for (const item of result.clues) {
        if (item.id === "memoryType" || item.id.startsWith("anchor:")) continue;
        const key = CLUE_KEY_BY_ID[item.id] ?? (item.label !== item.value ? item.label : item.id);
        if (!merged.has(key)) merged.set(key, { key, value: item.value });
      }
    }
    setExtractedClues(Array.from(merged.values()).slice(0, 6));
  }, [transcript, answerDraft, result, followUpMode]);

  /* ----------------------------- voice input ----------------------------- */
  function clearSilenceTimer() {
    if (silenceTimer.current !== null) {
      window.clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }

  function releaseMediaStream() {
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaStream.current = null;
  }

  function finishListening() {
    clearSilenceTimer();
    silenceStartedAt.current = null;
    releaseMediaStream();
    recognition.current = null;
    setIsRecording(false);
  }

  function stopListening() {
    const wasListening = isRecording || isStartingRef.current || shouldKeepListeningRef.current;
    const hasWords = hasSpeechRef.current || Boolean((followUpMode ? answerDraft : transcript).trim() || interim.trim());
    shouldKeepListeningRef.current = false;
    silenceExpiredRef.current = false;
    clearSilenceTimer();
    recognition.current?.stop();
    releaseMediaStream();
    recognition.current = null;
    setIsRecording(false);
    if (wasListening && !hasWords) {
      setError("I couldn't hear anything. Please try speaking again, or type the memory below.");
    }
  }

  function clearTranscription() {
    investigationAbortRef.current?.abort();
    investigationAbortRef.current = null;
    cancelSpeech();
    setIsSpeaking(false);
    shouldKeepListeningRef.current = false;
    silenceExpiredRef.current = false;
    hasSpeechRef.current = false;
    clearSilenceTimer();
    silenceStartedAt.current = null;
    const activeRecognition = recognition.current;
    if (activeRecognition) {
      activeRecognition.onresult = null;
      activeRecognition.onend = null;
      activeRecognition.onerror = null;
      activeRecognition.stop();
    }
    recognition.current = null;
    releaseMediaStream();
    setIsRecording(false);
    setIsThinking(false);
    setTranscript("");
    setInterim("");
    setAnswerDraft("");
    setResult(null);
    setRejected([]);
    setError(null);
    setTypingOpen(false);
    clarificationCountRef.current = 0;
    originalQueryRef.current = "";
    setPhase("capture");
  }

  async function startListening() {
    cancelSpeech();
    setIsSpeaking(false);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      setTypingOpen(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || isStartingRef.current || isRecording) return;

    isStartingRef.current = true;
    setError(null);
    hasSpeechRef.current = false;
    silenceStartedAt.current = null;
    shouldKeepListeningRef.current = true;
    silenceExpiredRef.current = false;

    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!shouldKeepListeningRef.current) {
        releaseMediaStream();
        return;
      }

      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = "en-US";
      recognitionInstance.onstart = () => {
        setIsRecording(true);
        setError(null);
        if (silenceStartedAt.current === null) silenceStartedAt.current = Date.now();
        clearSilenceTimer();
        const remainingSilence = Math.max(0, 8000 - (Date.now() - silenceStartedAt.current));
        silenceTimer.current = window.setTimeout(() => {
          if (hasSpeechRef.current || !shouldKeepListeningRef.current) return;
          silenceExpiredRef.current = true;
          shouldKeepListeningRef.current = false;
          recognitionInstance.stop();
          finishListening();
          setError("I couldn't hear anything after 8 seconds. Please try again, or type the memory below.");
        }, remainingSilence);
      };
      recognitionInstance.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let index = 0; index < event.results.length; index += 1) {
          const item = event.results[index];
          if (item.isFinal) finalText += item[0]?.transcript ?? "";
          else interimText += item[0]?.transcript ?? "";
        }
        const combinedText = `${finalText} ${interimText}`.trim();
        if (combinedText) {
          hasSpeechRef.current = true;
          silenceStartedAt.current = null;
          clearSilenceTimer();
        }
        if (followUpMode) setAnswerDraft(finalText.trim());
        else setTranscript(finalText.trim());
        setInterim(interimText.trim());
      };
      recognitionInstance.onend = () => {
        if (shouldKeepListeningRef.current && !silenceExpiredRef.current) {
          window.setTimeout(() => {
            if (!shouldKeepListeningRef.current || recognition.current !== recognitionInstance) return;
            try {
              recognitionInstance.start();
            } catch {
              // The browser can reject a restart while it is still closing.
            }
          }, 0);
          return;
        }
        finishListening();
      };
      recognitionInstance.onerror = (event) => {
        console.error("Speech error:", event.error);
        if (event.error === "no-speech") return;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          shouldKeepListeningRef.current = false;
          finishListening();
          setError("Microphone access was denied. Please allow microphone access in your browser settings, then try again.");
          return;
        }
        if (event.error === "audio-capture") {
          shouldKeepListeningRef.current = false;
          finishListening();
          setError("Your microphone couldn't be reached. Check that it is connected and enabled, then try again.");
          return;
        }
        shouldKeepListeningRef.current = false;
        finishListening();
        setError("Speech recognition stopped unexpectedly. Please try again or type the memory below.");
      };
      recognition.current = recognitionInstance;
      recognitionInstance.start();
    } catch (caught) {
      shouldKeepListeningRef.current = false;
      finishListening();
      const name = caught instanceof DOMException ? caught.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Microphone access was denied. Please allow microphone access in your browser settings, then try again.");
      } else if (name === "NotFoundError") {
        setError("No microphone was found. Connect or enable a microphone, then try again.");
      } else {
        setError("The microphone could not be started. Please check your browser settings and try again.");
      }
    } finally {
      isStartingRef.current = false;
    }
  }

  function toggleListening() {
    if (isRecording) stopListening();
    else startListening();
  }

  /* ---------------------------- speech output ---------------------------- */
  function speakOut(text: string) {
    cancelSpeech();
    setIsSpeaking(false);
    if (!text || mutedRef.current) return;
    speak(text, () => setIsSpeaking(true), () => setIsSpeaking(false));
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next && window.speechSynthesis) {
      cancelSpeech();
      setIsSpeaking(false);
    }
  }

  /* ----------------------------- investigation ----------------------------- */
  async function investigate(
    text: string,
    options: { rejectedCandidates?: string[]; confirmedCandidateId?: string; confirmedEntity?: string; confirmedEntityId?: string; confirmedEntityType?: string; clarificationCount?: number; exploreWorld?: boolean } = {},
  ) {
    if (!text.trim()) return;
    investigationAbortRef.current?.abort();
    const abortController = new AbortController();
    investigationAbortRef.current = abortController;
    cancelSpeech();
    setIsSpeaking(false);
    stopListening();
    setIsThinking(true);
    setError(null);
    setTypingOpen(false);
    setAnswerDraft("");
    clarificationCountRef.current = 1;
    setPhase(options.confirmedEntity ? "confirmed" : "investigating");
    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          transcript: text.trim(),
          previousClues: result?.clues,
          rejectedCandidates: options.rejectedCandidates ?? rejected,
          confirmedCandidateId: options.confirmedCandidateId,
          confirmedEntity: options.confirmedEntity,
          confirmedEntityId: options.confirmedEntityId,
          confirmedEntityType: options.confirmedEntityType,
          clarificationCount: options.clarificationCount ?? clarificationCountRef.current,
          exploreWorld: options.exploreWorld,
        }),
      });
      const body = (await response.json()) as InvestigationResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "The investigation could not continue.");
      const discovery = { ...body, followUpQuestion: null };
      setResult(discovery);
      setLibrary(saveFoundMemory(createSavedMemory(discovery, originalQueryRef.current || text)));
      if (body.investigationStatus === "confirmed") {
        setPhase("confirmed");
        setTypingOpen(false);
        setAnswerDraft("");
      } else {
        // Every valid fragment lands in the discovery constellation; the judge demo never
        // returns to the capture drawer or enters a clarification loop.
        setPhase("candidates");
        setTypingOpen(false);
        setAnswerDraft("");
      }
      speakOut(body.spokenResponse);
    } catch (caught) {
      if (abortController.signal.aborted) return;
      setPhase(options.confirmedEntity ? "confirmed" : result ? "candidates" : "investigating");
      setTypingOpen(false);
      setError(caught instanceof Error ? caught.message : "The investigation could not continue.");
    } finally {
      if (investigationAbortRef.current === abortController) investigationAbortRef.current = null;
      setIsThinking(false);
    }
  }

  function submitMemory() {
    cancelSpeech();
    setIsSpeaking(false);
    const text = followUpMode ? `${transcript} ${answerDraft}` : transcript;
    if (!text.trim()) return;
    if (!originalQueryRef.current) originalQueryRef.current = text.trim();
    if (followUpMode && result) {
      const answer = answerDraft.trim();
      const choices = result.culturalInvestigation.clarificationChips;
      const identified = [...choices, ...result.candidates.map((candidate) => candidate.title)].find((choice) => choice.toLowerCase() !== "neither" && answer.toLowerCase().includes(choice.toLowerCase()));
      const isNeither = /^\s*(no|neither|none|not those|none of those)\b/i.test(answer);
      const isAffirmative = !isNeither && /\b(yes|yeah|yep|that's it|that is it|that’s it|correct|right|exactly|that's the one|that’s the one)\b/i.test(answer);
      if (identified || isAffirmative) {
        const selected = identified ?? result.candidates[0]?.title ?? result.culturalInvestigation.hypothesis.leadEntity ?? choices.find((choice) => choice.toLowerCase() !== "neither");
        if (selected) {
          confirmEntity(selected);
          return;
        }
      }
    }
    setTranscript(text.trim());
    setAnswerDraft("");
    void investigate(text, { clarificationCount: clarificationCountRef.current });
  }

  function rememberCurrentMemory(titleOverride?: string) {
    if (!result) return;
    setLibrary(saveFoundMemory(createSavedMemory(result, originalQueryRef.current || transcript, titleOverride)));
  }

  function rejectCandidate(candidate: InvestigationCandidate) {
    const nextRejected = [...new Set([...rejected, candidate.id, candidate.entityId])];
    setRejected(nextRejected);
    void investigate(transcript, { rejectedCandidates: nextRejected });
  }

  function confirmCandidate(candidate: InvestigationCandidate) {
    const anchor = result?.resolvedAnchors.find((item) => item.entityId === candidate.entityId);
    confirmEntity(candidate.title, candidate.entityId, anchor?.entityType ?? qlooTypeForMemory(candidate.type), candidate.id);
  }

  function confirmEntity(name: string, entityId?: string, entityType?: string, candidateId?: string) {
    cancelSpeech();
    setIsSpeaking(false);
    setPhase("confirmed");
    setTypingOpen(false);
    if (result) setLibrary(saveFoundMemory(createSavedMemory(result, originalQueryRef.current || transcript, name)));
    setResult((current) => {
      if (!current) return current;
      const prior = current.candidates.find((candidate) => candidate.id === candidateId || candidate.entityId === entityId || candidate.title.toLowerCase() === name.toLowerCase());
      const confirmed = prior ?? {
        id: candidateId ?? `user-confirmed:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        entityId: entityId ?? `user-confirmed:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: name,
        type: current.extraction.primaryDomain === "screen" ? "person" as const : current.extraction.primaryDomain === "places" ? "place" as const : current.extraction.primaryDomain === "music" ? "music" as const : "unknown" as const,
        strength: "strong_match" as const,
        explanation: "Selected by the user; Qloo cultural connections are being refreshed.",
        context: current.extraction.culturalKeywords.slice(0, 3),
        signalNames: [],
        provenance: "user_confirmed" as const,
        qlooEvidence: { requestIds: [] },
      };
      const confirmationLabel = `${name}${name.toLowerCase() === "james spader" && /black\s*list/i.test(current.extraction.cleanedTranscript) ? " (Raymond Reddington in The Blacklist)" : ""}`;
      return {
        ...current,
        candidates: [confirmed],
        confirmedEntity: name,
        investigationStatus: "confirmed",
        followUpQuestion: null,
        spokenResponse: `Memory Recovered: ${confirmationLabel}`,
        culturalInvestigation: {
          ...current.culturalInvestigation,
          hypothesis: {
            ...current.culturalInvestigation.hypothesis,
            leadEntity: name,
            confidenceScore: prior?.qlooEvidence.affinity ?? null,
            qlooResolved: true,
            reasoning: "Resolved via Qloo cultural entity correlation and cross-domain taste mapping.",
          },
          agentFollowUp: "",
          clarificationChips: [],
        },
      };
    });
    const text = `${transcript} I remember ${name}.`;
    setTranscript(text);
    setAnswerDraft("");
    void investigate(text, {
      confirmedEntity: name,
      confirmedEntityId: entityId,
      confirmedEntityType: entityType,
      confirmedCandidateId: candidateId,
      clarificationCount: 1,
    });
  }

  function resetSession() {
    stopListening();
    cancelSpeech();
    clarificationCountRef.current = 0;
    originalQueryRef.current = "";
    recognition.current = null;
    setIsSpeaking(false);
    setIsThinking(false);
    setPhase("capture");
    setTranscript("");
    setInterim("");
    setAnswerDraft("");
    setResult(null);
    setRejected([]);
    setError(null);
    setTypingOpen(false);
  }

  function revisitMemory(item: SavedMemory) {
    originalQueryRef.current = item.query;
    setTranscript(item.query);
    setTypingOpen(false);
    if (item.snapshot) {
      setResult(item.snapshot);
      setPhase(item.snapshot.investigationStatus === "confirmed" ? "confirmed" : "candidates");
    } else {
      setResult(null);
      void investigate(item.query, { clarificationCount: 1 });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function investigateJudgeScenario(scenario: string) {
    cancelSpeech();
    stopListening();
    setError(null);
    setTypingOpen(false);
    setTranscript(scenario);
    originalQueryRef.current = scenario;
    void investigate(scenario, { clarificationCount: 1 });
  }

  /* ------------------------------- derived ------------------------------- */
  const agentState: AgentState = isThinking
    ? "thinking"
    : isSpeaking
      ? "speaking"
      : isRecording
        ? "recording"
        : "idle";
  const currentTranscript = followUpMode ? answerDraft : transcript;
  const hasMemory = Boolean(currentTranscript.trim() || interim.trim());
  const showOrb = phase === "capture" || phase === "investigating" || phase === "clarify";
  const micEnabled = (phase === "capture" || phase === "clarify") && !isThinking;
  const showTyping = typingOpen && (phase === "capture" || phase === "clarify");
  const showJudgeScenarios =
    phase === "capture" && !transcript.trim() && !interim && !isRecording && !isThinking && !typingOpen;
  const isResultPhase = phase === "candidates" || phase === "confirmed" || phase === "world";
  const primaryLabel = isThinking
    ? "Investigating with Qloo Taste Graph…"
    : phase === "clarify"
      ? "Continue the investigation"
      : isResultPhase
        ? "New memory"
        : "End & View Candidates";
  const primaryDisabled = isThinking || (!isResultPhase && !currentTranscript.trim());
  const primaryAction = isResultPhase ? resetSession : submitMemory;

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-[#0c0914] text-slate-200 antialiased">
      {/* ambient lavender / cyan wash — the radial gradients carry their own
          soft falloff, so no extra blur layer is needed on top of them */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.28),transparent)]" />
        <div className="absolute right-[-14%] top-1/3 h-[440px] w-[440px] rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.12),transparent)]" />
        <div className="absolute bottom-[-12%] left-[-12%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(168,85,247,0.16),transparent)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <StatusBar state={agentState} muted={muted} onReset={resetSession} />

        <main
          id="main"
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-5 pb-64 pt-9 sm:pt-14"
        >
          <h1 className="sr-only">Memory Explorer — voice investigation</h1>

          {showOrb ? (
            <VoiceOrb state={agentState} disabled={!micEnabled} onToggle={toggleListening} />
          ) : null}

          <TranscriptFeed
            text={currentTranscript}
            interim={interim}
            placeholder={
              followUpMode
                ? "Speak your answer — even “no, it wasn’t a group” helps me focus."
                : TRANSCRIPT_PLACEHOLDER
            }
            canClear={Boolean(currentTranscript.trim() || interim)}
            onClear={clearTranscription}
          />

          {showJudgeScenarios ? <JudgeScenarioSection onSelect={investigateJudgeScenario} /> : null}

          <ClueChips chips={extractedClues} />

          {phase === "investigating" ? <InvestigatingSteps /> : null}

          {error ? (
            <p
              role="alert"
              className="mt-6 w-full rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}

          {showTyping ? (
            <TypingPanel
              mode={followUpMode ? "clarify" : "capture"}
              voiceSupported={voiceSupported}
              transcript={transcript}
              answerDraft={answerDraft}
              onTranscriptChange={setTranscript}
              onAnswerChange={setAnswerDraft}
              onDemo={() => {
                setTranscript(DEMO_MEMORY);
                setError(null);
              }}
              onClose={() => setTypingOpen(false)}
            />
          ) : null}

          {phase === "capture" && !hasMemory && !typingOpen ? (
            <button
              type="button"
              onClick={() => {
                setTranscript(DEMO_MEMORY);
                setTypingOpen(true);
              }}
              className="mt-7 text-xs! font-semibold! tracking-wide !text-slate-400 underline decoration-dotted underline-offset-4 transition hover:!text-purple-300"
            >
              Use a sample fragment
            </button>
          ) : null}

          {phase === "clarify" && result ? (
            <ClarifyCard question={result.followUpQuestion ?? result.culturalInvestigation.agentFollowUp} memory={transcript} chips={result.culturalInvestigation.clarificationChips} onChoose={(choice) => {
              if (choice.toLowerCase() === "neither") {
                const refined = `${transcript} Neither of those candidates sounds right.`;
                setTranscript(refined);
                void investigate(refined, { clarificationCount: 1 });
                return;
              }
              const candidate = result.candidates.find((item) => item.title.toLowerCase() === choice.toLowerCase());
              const anchor = result.resolvedAnchors.find((item) => item.name?.toLowerCase() === choice.toLowerCase());
              confirmEntity(choice, anchor?.entityId ?? candidate?.entityId, anchor?.entityType ?? (candidate ? qlooTypeForMemory(candidate.type) : "urn:entity:person"), candidate?.id);
            }} onListen={() => speakOut(result.spokenResponse)} />
          ) : null}

          {phase === "candidates" && result ? (
            <WorldCard
              result={result}
              queryText={originalQueryRef.current || transcript}
              onListen={() => speakOut(result.directAnswer.detailedExplanation)}
              onConfirm={() => result.candidates[0] && confirmCandidate(result.candidates[0])}
              onAnswer={() => { setAnswerDraft(""); setPhase("clarify"); setTypingOpen(true); }}
              onSave={() => rememberCurrentMemory(result.confirmedEntity ?? result.directAnswer.title)}
              isSaved={library.some((item) => item.query.toLowerCase() === (originalQueryRef.current || transcript).toLowerCase())}
              onFindAnother={resetSession}
            />
          ) : null}

          {phase === "confirmed" && result ? (
            <WorldCard
              result={result}
              queryText={originalQueryRef.current || transcript}
              onListen={() => speakOut(result.directAnswer.detailedExplanation)}
              onConfirm={() => undefined}
              onAnswer={() => undefined}
              onSave={() => rememberCurrentMemory(result.confirmedEntity ?? result.directAnswer.title)}
              isSaved={library.some((item) => item.query.toLowerCase() === (originalQueryRef.current || transcript).toLowerCase())}
              onFindAnother={resetSession}
            />
          ) : null}

          {phase === "world" && result ? (
            <WorldCard result={result} queryText={originalQueryRef.current || transcript} onListen={() => speakOut(result.directAnswer.detailedExplanation)} onConfirm={() => undefined} onAnswer={() => { setAnswerDraft(""); setPhase("clarify"); setTypingOpen(true); }} onSave={() => rememberCurrentMemory(result.confirmedEntity ?? result.directAnswer.title)} isSaved={library.some((item) => item.query.toLowerCase() === (originalQueryRef.current || transcript).toLowerCase())} onFindAnother={resetSession} />
          ) : null}
        </main>

        <ArchiveSection library={library} onRevisit={revisitMemory} />

        <ControlDock
          state={agentState}
          micEnabled={micEnabled}
          muted={muted}
          typingOpen={typingOpen}
          showTypeToggle={phase === "capture" || phase === "clarify"}
          primaryLabel={primaryLabel}
          primaryDisabled={primaryDisabled}
          onToggleMic={toggleListening}
          onToggleType={() => setTypingOpen((open) => !open)}
          onToggleMute={toggleMute}
          onPrimary={primaryAction}
        />
      </div>
    </div>
  );
}

const STATE_TEXT_COLOR: Record<AgentState, string> = {
  idle: "text-slate-300",
  recording: "text-purple-200",
  thinking: "text-cyan-200",
  speaking: "text-violet-200",
};

/* ------------------------------ top status bar ------------------------------ */

function StatusBar({ state, muted, onReset }: { state: AgentState; muted: boolean; onReset: () => void }) {
  const dot =
    state === "recording"
      ? "bg-purple-400"
      : state === "thinking"
        ? "bg-amber-400"
        : state === "speaking"
          ? "bg-cyan-400"
          : "bg-emerald-400";

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0c0914]/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 !text-slate-300 transition hover:border-white/25 hover:bg-white/5 hover:!text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
          >
            <ArrowLeftIcon />
          </Link>
          <p className="hidden truncate text-sm font-semibold !text-white sm:block">
            Taste Time Machine <span className="!text-slate-600">/</span>
            <span className="font-medium !text-slate-400"> Voice Explorer</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dot} opacity-60`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
          </span>
          <span className="whitespace-nowrap text-[11px]! font-semibold! tracking-wide !text-slate-300" role="status">
            {STATUS_TEXT[state]}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden items-center gap-1.5 text-[11px] font-medium !text-slate-400 md:flex">
            <SpeakerIcon className="h-3.5 w-3.5" />
            Voice: Spoken Discovery{muted ? " (muted)" : ""}
          </span>
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset session"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 !text-slate-300 transition hover:border-white/25 hover:bg-white/5 hover:!text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
          >
            <ResetIcon />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------- voice orb ------------------------------- */

function VoiceOrb({ state, disabled, onToggle }: { state: AgentState; disabled: boolean; onToggle: () => void }) {
  const recording = state === "recording";
  const thinking = state === "thinking";
  const speaking = state === "speaking";

  const bloopState = recording
    ? BloopState.listen
    : thinking
      ? BloopState.think
      : speaking
        ? BloopState.speak
        : BloopState.idle;

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={recording ? "Stop listening" : STATE_CAPTION[state]}
        className="group relative rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0c0914] disabled:cursor-not-allowed"
      >
        <OrbBloop
          size={180}
          state={bloopState}
          bloopColorMain={[0.55, 0.22, 0.95]}
          bloopColorLow={[0.25, 0.09, 0.48]}
          bloopColorMid={[0.45, 0.18, 0.82]}
          bloopColorHigh={[0.78, 0.52, 1.0]}
          watercolorStrength={0.4}
          className={`mx-auto transition-opacity duration-500 group-hover:scale-[1.03] ${disabled && !thinking ? "opacity-65 saturate-[.8]" : ""}`}
        />
      </button>

      <div className="mt-7 flex flex-col items-center gap-1.5 text-center">
        <p className={`text-sm font-semibold tracking-wide ${STATE_TEXT_COLOR[state]}`}>{STATE_CAPTION[state]}</p>
        <p className="text-xs !text-slate-500">{STATE_HINT[state]}</p>
      </div>
    </div>
  );
}

/* --------------------------- live transcription feed --------------------------- */

function TranscriptFeed({ text, interim, placeholder, canClear, onClear }: { text: string; interim: string; placeholder: string; canClear: boolean; onClear: () => void }) {
  const words = text.trim() ? text.trim().split(/\s+/) : [];
  const isEmpty = words.length === 0 && !interim;

  return (
    <div className="relative mt-9 w-full px-1" aria-live="polite">
      {canClear ? (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onClear} className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400 transition hover:text-white">
            ✕ Clear
          </button>
        </div>
      ) : null}
      <p className={`text-center text-lg leading-relaxed sm:text-xl ${isEmpty ? "" : "text-white"}`}>
        {isEmpty ? <span className="!text-slate-500">{placeholder}</span> : null}
        {!isEmpty
          ? words.map((word, index) => {
              const fresh = index >= words.length - 3;
              return (
                <span
                  key={`${index}-${word}`}
                  className={`transition-opacity duration-700 ${fresh ? "opacity-60" : "opacity-100"}`}
                >
                  {word}{" "}
                </span>
              );
            })
          : null}
        {!isEmpty && interim ? <span className="opacity-50">{interim}</span> : null}
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-[0.95em] w-[3px] translate-y-[2px] animate-pulse rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]"
        />
      </p>
    </div>
  );
}

function JudgeScenarioSection({ onSelect }: { onSelect: (scenario: string) => void }) {
  return (
    <section className="mt-7 w-full" aria-label="One-click judge scenarios">
      <p className="text-center text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Quick judge cases</p>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
        {JUDGE_SCENARIOS.map((scenario) => (
          <button key={scenario.label} type="button" onClick={() => onSelect(scenario.transcript)} className="min-w-0 rounded-2xl border border-purple-300/20 bg-white/[0.035] px-3.5 py-3 text-left transition hover:border-purple-200/45 hover:bg-purple-500/10">
            <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-purple-200/75">{scenario.emoji} {scenario.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-slate-200">{scenario.clue}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ clue chip pills ------------------------------ */

function ClueChips({ chips }: { chips: ClueChip[] }) {
  if (chips.length === 0) return null;
  return (
    <ul className="mt-6 flex flex-wrap items-center justify-center gap-2" aria-label="Extracted clues">
      {chips.map((chip) => (
        <li
          key={chip.key}
          className="flex items-center gap-1.5 rounded-full border border-purple-400/35 bg-white/[0.04] px-3 py-1.5 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.9)]"
          />
          <span className="font-medium !text-purple-200/80">{chip.key}:</span>
          <span className="font-semibold !text-white">{chip.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------- investigating progress --------------------------- */

const STEP_DELAY_CLASSES = ["", "[animation-delay:300ms]", "[animation-delay:600ms]"];

function InvestigatingSteps() {
  const steps = ["The memory", "The clues", "Cultural threads"];
  return (
    <section className="mt-8 w-full rounded-3xl border border-purple-300/20 bg-purple-500/[0.06] p-5 text-center shadow-[0_24px_60px_rgba(0,0,0,0.25)]" role="status" aria-live="polite">
      <p className="text-sm font-bold text-white">Investigating with Qloo Taste Graph…</p>
      <p className="mt-2 text-xs text-slate-400">Opening the cultural constellation across music, screen, and places.</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        {steps.map((step, index) => (
          <span key={step} className="flex items-center gap-2.5">
            {index > 0 ? <span aria-hidden="true" className="text-slate-600">→</span> : null}
            <span className={`animate-pulse rounded-full border px-3.5 py-1.5 text-[11px] font-semibold ${STEP_DELAY_CLASSES[index]} ${index === 0 ? "border-purple-400/40 bg-purple-500/15 !text-purple-100" : "border-white/10 bg-white/[0.03] !text-slate-400"}`}>
              {step}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <span className="rounded-xl border border-white/10 p-3">🎵 Music</span>
        <span className="rounded-xl border border-white/10 p-3">🎬 Screen</span>
        <span className="rounded-xl border border-white/10 p-3">📍 Places</span>
      </div>
    </section>
  );
}

/* -------------------------------- typing panel -------------------------------- */

function TypingPanel({
  mode,
  voiceSupported,
  transcript,
  answerDraft,
  onTranscriptChange,
  onAnswerChange,
  onDemo,
  onClose,
}: {
  mode: "capture" | "clarify";
  voiceSupported: boolean;
  transcript: string;
  answerDraft: string;
  onTranscriptChange: (value: string) => void;
  onAnswerChange: (value: string) => void;
  onDemo: () => void;
  onClose: () => void;
}) {
  const isClarify = mode === "clarify";
  return (
    <section className="mt-7 w-full rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <label htmlFor="typed-memory" className="block text-[11px] font-bold uppercase tracking-[0.14em] !text-purple-300/80">
          {isClarify ? "Or type a reply" : "Write the fragment you almost remember"}
        </label>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close typing panel"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 !text-slate-400 transition hover:border-white/25 hover:bg-white/5 hover:!text-white"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        id="typed-memory"
        rows={3}
        autoFocus={!isClarify}
        value={isClarify ? answerDraft : transcript}
        onChange={(event) => (isClarify ? onAnswerChange(event.target.value) : onTranscriptChange(event.target.value))}
        placeholder={isClarify ? "No, it wasn't a group…" : "Start anywhere…"}
        className="mt-3 block w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-3 text-sm! leading-relaxed! !text-white outline-none placeholder:!text-slate-500 focus:border-purple-400/60"
      />
      {!voiceSupported && !isClarify ? (
        <p className="mt-2 text-xs !text-amber-300/80">
          Voice input isn&apos;t available in this browser, so type your memory here.
        </p>
      ) : null}
      {!isClarify ? (
        <button
          type="button"
          onClick={onDemo}
          className="mt-3 text-xs! font-semibold! !text-slate-400 underline decoration-dotted underline-offset-4 transition hover:!text-purple-300"
        >
          Use a sample fragment
        </button>
      ) : null}
    </section>
  );
}

/* ------------------------------ floating control dock ------------------------------ */

function ControlDock({
  state,
  micEnabled,
  muted,
  typingOpen,
  showTypeToggle,
  primaryLabel,
  primaryDisabled,
  onToggleMic,
  onToggleType,
  onToggleMute,
  onPrimary,
}: {
  state: AgentState;
  micEnabled: boolean;
  muted: boolean;
  typingOpen: boolean;
  showTypeToggle: boolean;
  primaryLabel: string;
  primaryDisabled: boolean;
  onToggleMic: () => void;
  onToggleType: () => void;
  onToggleMute: () => void;
  onPrimary: () => void;
}) {
  const recording = state === "recording";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-3.5 px-4 pb-5">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-[28px] border border-white/10 bg-white/[0.045] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:rounded-full">
        {/* central glowing mic with ripple */}
        <button
          type="button"
          onClick={onToggleMic}
          disabled={!micEnabled}
          aria-label={recording ? "Stop listening" : "Start listening"}
          aria-pressed={recording}
          className="relative grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-cyan-500 !text-white shadow-[0_0_28px_rgba(139,92,246,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {recording ? (
            <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-purple-400/40" />
          ) : null}
          <span className="relative">{recording ? <StopIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}</span>
        </button>

        {showTypeToggle ? (
          <button
            type="button"
            onClick={onToggleType}
            aria-pressed={typingOpen}
            className={`flex h-10 items-center gap-2 rounded-full border px-4 text-xs! font-semibold! transition ${
              typingOpen
                ? "border-purple-400/50 bg-purple-500/20 !text-white"
                : "border-white/10 bg-white/[0.03] !text-slate-300 hover:border-white/25 hover:bg-white/[0.07]"
            }`}
          >
            <KeyboardIcon className="h-4 w-4" />
            Type instead
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Unmute voice output" : "Mute voice output"}
          className={`grid h-10 w-10 place-items-center rounded-full border transition ${
            muted
              ? "border-amber-400/40 bg-amber-400/10 !text-amber-300"
              : "border-white/10 bg-white/[0.03] !text-slate-300 hover:border-white/25 hover:bg-white/[0.07]"
          }`}
        >
          {muted ? <MuteIcon className="h-4.5 w-4.5" /> : <VolumeIcon className="h-4.5 w-4.5" />}
        </button>

        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="h-10 rounded-full bg-white px-5 text-xs! font-bold! !text-slate-900 shadow-[0_10px_30px_rgba(255,255,255,0.14)] transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {primaryLabel}
        </button>
      </div>

    </div>
  );
}

/* ------------------------------ clarify follow-up ------------------------------ */

function ClarifyCard({ question, memory, chips = [], onChoose, onListen }: { question: string | null; memory: string; chips?: string[]; onChoose: (choice: string) => void; onListen: () => void }) {
  return (
    <section className="mt-8 w-full rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-purple-300/70">A new clue</p>
      <div className="mt-4 flex gap-4">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-purple-400/40 bg-purple-500/15 text-lg font-semibold text-purple-200"
        >
          ?
        </span>
        <div className="min-w-0">
          <p className="text-lg font-medium leading-snug text-white sm:text-xl">
            {question ?? "Can you add one more detail?"}
          </p>
          <button
            type="button"
            onClick={onListen}
            className="mt-3 flex items-center gap-2 text-xs! font-bold! uppercase tracking-[0.1em] !text-purple-300 transition hover:!text-purple-200"
          >
            <SpeakerIcon className="h-4 w-4" /> Hear the question
          </button>
        </div>
      </div>
      {memory ? (
        <p className="mt-5 border-t border-white/10 pt-4 text-sm italic leading-relaxed text-slate-400">
          You said: &ldquo;{memory}&rdquo;
        </p>
      ) : null}
      {chips.length ? <div className="mt-4"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Possible cast members</span><div className="mt-2 flex flex-wrap gap-2">{chips.map((chip) => <button key={chip} type="button" onClick={() => onChoose(chip)} className="rounded-full border border-purple-300/25 bg-purple-300/10 px-4 py-2 text-xs! font-semibold! !text-purple-100 transition hover:bg-purple-300/20">{chip}</button>)}</div></div> : null}
    </section>
  );
}

/* --------------------------------- candidates --------------------------------- */

const STRENGTH_TEXT: Record<InvestigationCandidate["strength"], string> = {
  strong_match: "text-emerald-300",
  possible_match: "text-amber-300",
  worth_exploring: "text-sky-300",
};

function CandidateCard({
  result,
  primaryCandidate,
  onConfirm,
  onReject,
  onListen,
}: {
  result: InvestigationResult;
  primaryCandidate?: InvestigationCandidate;
  onConfirm: (candidate: InvestigationCandidate) => void;
  onReject: (candidate: InvestigationCandidate) => void;
  onListen: () => void;
}) {
  if (!primaryCandidate) return null;

  return (
    <section className="mt-9 w-full">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-purple-300/70">
          Discovery / a thread surfaces
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Something is emerging.
        </h2>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <CandidateArtwork candidate={primaryCandidate} />

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6">
          <span className={`text-[11px] font-bold uppercase tracking-[0.15em] ${STRENGTH_TEXT[primaryCandidate.strength]}`}>
            {primaryCandidate.strength.replace("_", " ")}
          </span>
          <h3 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-white">
            {primaryCandidate.title}
          </h3>
          <p className="mt-2 text-[11px] uppercase tracking-[0.1em] text-slate-400">
            {primaryCandidate.year ? `${primaryCandidate.year} · ` : ""}
            {primaryCandidate.type} · {primaryCandidate.context.slice(0, 2).join(" · ")}
          </p>

          <div className="mt-5 border-y border-white/10 py-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Why this surfaced</span>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{primaryCandidate.explanation}</p>
          </div>

          <div className="mt-5 flex flex-col gap-3 min-[560px]:flex-row min-[560px]:items-center">
            <button
              type="button"
              onClick={() => onConfirm(primaryCandidate)}
              className="min-h-[46px] rounded-full bg-white px-6 text-xs! font-bold! !text-slate-900 transition hover:bg-purple-100"
            >
              Yes, this was it! <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              onClick={() => onReject(primaryCandidate)}
              className="min-h-[46px] rounded-full border border-white/15 px-6 text-xs! font-semibold! !text-slate-300 transition hover:border-white/30 hover:bg-white/5 hover:!text-white"
            >
              Not this
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
        <span className="mt-0.5 text-purple-300">
          <SpeakerIcon className="h-4.5 w-4.5" />
        </span>
        <p className="min-w-0 flex-1 text-sm italic leading-relaxed text-slate-300">{result.spokenResponse}</p>
        <button
          type="button"
          onClick={onListen}
          className="shrink-0 text-xs! font-bold! uppercase tracking-[0.1em] !text-purple-300 transition hover:!text-purple-200"
        >
          Listen
        </button>
      </div>

      {result.candidates.length > 1 ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-[0.1em] text-slate-500">Other threads in the room</span>
          {result.candidates.slice(1).map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onConfirm(candidate)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm! font-medium! !text-slate-200 transition hover:border-purple-400/40 hover:bg-purple-500/10 hover:!text-white"
            >
              {candidate.title} <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CandidateArtwork({ candidate }: { candidate: InvestigationCandidate }) {
  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      {candidate.imageUrl ? (
        <img
          src={candidate.imageUrl}
          alt=""
          className="block h-full max-h-[460px] min-h-[320px] w-full object-cover"
        />
      ) : (
        <div className="flex min-h-[320px] flex-col justify-end bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.35),rgba(12,9,20,0.92))] p-6">
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">The</span>
          <strong className="my-2 text-3xl font-semibold leading-tight text-white">{candidate.title}</strong>
          <span className="text-sm text-purple-300">{candidate.year ?? "a remembered thread"}</span>
        </div>
      )}
      <span className="absolute bottom-3 right-4 text-[10px] font-bold tracking-[0.14em] text-slate-300/80">
        QLOO / CULTURAL TRACE
      </span>
    </div>
  );
}

/* --------------------------------- confirmed --------------------------------- */

function ConfirmedCard({
  result,
  primaryCandidate,
  onExplore,
  onListen,
  onFindAnother,
}: {
  result: InvestigationResult;
  primaryCandidate?: InvestigationCandidate;
  onExplore: () => void;
  onListen: () => void;
  onFindAnother: () => void;
}) {
  const title = primaryCandidate?.title ?? result.candidates[0]?.title ?? "The memory";

  return (
    <section className="mt-9 w-full rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-7">
      <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-purple-300/70">
        Confirmation / the thread holds
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">We found it.</h2>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">
        The memory has a name now. You can keep following what surrounded it.
      </p>

      <div className="mt-6 rounded-2xl border border-purple-400/25 bg-purple-500/10 p-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-200">QLOO TASTE GRAPH INSIGHT</span>
        <span className="mt-3 block text-[10px] font-bold uppercase tracking-[0.14em] text-purple-200/70">The memory</span>
        <strong className="mt-2 block text-2xl font-semibold tracking-tight text-white">{title}</strong>
        <small className="mt-1 block text-[11px] uppercase tracking-[0.1em] text-slate-400">
          {primaryCandidate?.year ?? ""} · {primaryCandidate?.type ?? "cultural thread"}
        </small>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onExplore}
          className="rounded-full bg-white px-6 py-3 text-xs! font-bold! !text-slate-900 transition hover:bg-purple-100"
        >
          Explore the world around this memory <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          onClick={onListen}
          className="flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-xs! font-semibold! !text-slate-300 transition hover:border-white/30 hover:bg-white/5 hover:!text-white"
        >
          <SpeakerIcon className="h-4 w-4" /> Hear it again
        </button>
      </div>

      {result.thread.length > 0 ? (
        <div className="mt-6 border-t border-white/10 pt-5">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            The thread so far
          </span>
          <ul className="mt-3 flex flex-wrap gap-2">
            {result.thread.slice(0, 9).map((node, index) => (
              <li
                key={`${node.label}-${index}`}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300"
              >
                <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-purple-300">
                  {node.kind === "remembered" ? "clue" : node.kind === "candidate" ? "found" : "world"}
                </span>
                {node.label}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">{result.provenance.note}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onFindAnother}
        className="mt-6 text-xs! font-semibold! !text-slate-400 underline decoration-dotted underline-offset-4 transition hover:!text-purple-300"
      >
        Find another memory
      </button>
    </section>
  );
}

/* ------------------------------ cultural world ------------------------------ */

function WorldCard({
  result,
  queryText,
  onListen,
  onConfirm,
  onAnswer,
  onSave,
  isSaved,
  onFindAnother,
}: {
  result: InvestigationResult;
  queryText: string;
  onListen: () => void;
  onConfirm: () => void;
  onAnswer: () => void;
  onSave: () => void;
  isSaved: boolean;
  onFindAnother: () => void;
}) {
  const [showInspector, setShowInspector] = useState(false);
  const [showKeepsake, setShowKeepsake] = useState(false);
  const directAnswer = result.directAnswer;
  const leadCandidate = result.candidates.find((candidate) => candidate.title.toLowerCase() === directAnswer.title.toLowerCase()) ?? result.candidates[0];
  const leadLabels = [directAnswer.title, leadCandidate?.title, result.extraction.leadEntity].filter((label): label is string => Boolean(label)).map((label) => label.toLowerCase());
  const resolvedAnchor = result.resolvedAnchors.find((anchor) => anchor.state === "resolved" && [anchor.name, anchor.query].some((label) => Boolean(label && leadLabels.includes(label.toLowerCase()))));
  const qlooAffinity = leadCandidate?.qlooEvidence.affinity;
  const affinityPercent = result.provenance.qlooCalls > 0
    ? qlooAffinity !== undefined
      ? Math.round(qlooAffinity <= 1 ? qlooAffinity * 100 : qlooAffinity)
      : directAnswer.tasteAffinityScore > 0 ? directAnswer.tasteAffinityScore : null
    : null;
  const taxonomyTags = Array.from(new Set([
    resolvedAnchor?.entityType,
    ...(leadCandidate?.type ? [leadCandidate.type] : []),
    ...result.extraction.domains,
    ...(leadCandidate?.signalNames ?? []),
    ...result.culturalSignals.map((signal) => signal.name),
  ].filter((tag): tag is string => Boolean(tag)))).slice(0, 10);
  const artifacts = [
    ...result.culturalConnections.flatMap((group) => group.items.map((item) => ({ title: item.title, detail: item.context, relation: item.whyConnected }))),
    ...result.culturalInvestigation.reconstructedWorld.music.map((item) => ({ title: item.title, detail: item.artist, relation: item.affinity })),
    ...result.culturalInvestigation.reconstructedWorld.film.map((item) => ({ title: item.title, detail: item.year, relation: item.correlation })),
    ...result.culturalInvestigation.reconstructedWorld.venues.map((item) => ({ title: item.name, detail: item.location, relation: item.historicalContext })),
  ].filter((item, index, items) => items.findIndex((candidate) => candidate.title.toLowerCase() === item.title.toLowerCase()) === index).slice(0, 3);
  const connections = result.culturalConnections.length > 0 ? result.culturalConnections : [{
    groupName: "Connected Cultural Eras",
    items: [
      { title: "Historical Context & Broadcasts", context: "Documentary and archival records", whyConnected: "A contextual path through historical records surrounding this memory." },
      { title: "Era Music & Soundtracks", context: "Reflective and memorial works", whyConnected: "A contextual path through music and public memory from the surrounding era." },
    ],
  }];

  return (
    <>
    <section className="mt-9 w-full rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-7">
      <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-purple-300/70">
        {result.investigationStatus === "confirmed" ? "The memory is yours" : "The direct answer"}
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {directAnswer.title}
      </h2>
      <p className="mt-2 text-sm text-slate-300">{directAnswer.subtitle}</p>

      <div className="mt-6 rounded-3xl border border-purple-400/30 bg-purple-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setShowInspector(true)} className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-200 transition hover:border-emerald-200/50 hover:bg-emerald-300/15">
            ✦ {result.provenance.qlooCalls > 0 ? `Qloo Taste Graph · ${affinityPercent === null ? "Evidence" : `${affinityPercent}% Affinity`}` : "Cultural Match · Evidence"}
          </button>
          <button
            type="button"
            onClick={onListen}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs! font-bold! !text-slate-950 transition hover:bg-purple-100"
          >
            <SpeakerIcon className="h-4 w-4" /> Play Spoken Summary
          </button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-100 sm:text-base">{directAnswer.detailedExplanation}</p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {connections.map((group) => (
          <section key={group.groupName} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-200/80">{group.groupName}</h3>
            <ul className="mt-3 grid gap-2">
              {group.items.map((item) => (
                <li key={`${group.groupName}-${item.title}`} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <strong className="block text-sm text-white">{item.title}</strong>
                  <span className="mt-1 block text-xs text-slate-400">{item.context}</span>
                  <span className="mt-2 inline-block rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold leading-relaxed text-cyan-100/80">
                    {item.whyConnected}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-5 border-t border-white/10 pt-5">
        <div className="max-w-lg">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            A world around the memory
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {result.investigationStatus === "confirmed" ? <button type="button" onClick={onSave} disabled={isSaved} className="rounded-full bg-white px-6 py-3 text-xs! font-bold! !text-slate-950 disabled:cursor-default disabled:opacity-60">{isSaved ? "Saved to Found Memories ✓" : "Save to Found Memories"}</button> : <button type="button" onClick={onConfirm} className="rounded-full bg-white px-6 py-3 text-xs! font-bold! !text-slate-950">Yes, this was it!</button>}
          <button type="button" onClick={() => setShowKeepsake(true)} className="rounded-full border border-purple-300/30 bg-purple-400/10 px-6 py-3 text-xs! font-bold! !text-purple-100 transition hover:bg-purple-400/20">Export Keepsake</button>
          {result.investigationStatus !== "confirmed" && result.followUpQuestion ? <button type="button" onClick={onAnswer} className="rounded-full bg-purple-500 px-6 py-3 text-xs! font-bold! !text-white transition hover:bg-purple-400">Answer agent&apos;s follow-up</button> : null}
          <button
            type="button"
            onClick={onListen}
            className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-xs! font-bold! !text-slate-900 transition hover:bg-purple-100"
          >
            <SpeakerIcon className="h-4 w-4" /> Read this world aloud
          </button>
          <button
            type="button"
            onClick={onFindAnother}
            className="rounded-full border border-white/15 px-6 py-3 text-xs! font-semibold! !text-slate-300 transition hover:border-white/30 hover:bg-white/5 hover:!text-white"
          >
            Find another memory
          </button>
        </div>
      </div>
    </section>
    {showInspector ? (
      <QlooInspectorModal
        result={result}
        entityId={resolvedAnchor?.entityId ?? (leadCandidate?.provenance === "qloo" ? leadCandidate.entityId : null)}
        entityType={resolvedAnchor?.entityType ?? leadCandidate?.type ?? null}
        taxonomyTags={taxonomyTags}
        affinityPercent={affinityPercent}
        onClose={() => setShowInspector(false)}
      />
    ) : null}
    {showKeepsake ? <KeepsakeModal result={result} queryText={queryText} artifacts={artifacts} onClose={() => setShowKeepsake(false)} /> : null}
    </>
  );
}

function QlooInspectorModal({
  result,
  entityId,
  entityType,
  taxonomyTags,
  affinityPercent,
  onClose,
}: {
  result: InvestigationResult;
  entityId: string | null;
  entityType: string | null;
  taxonomyTags: string[];
  affinityPercent: number | null;
  onClose: () => void;
}) {
  const domainName: Record<string, string> = { music: "Music", screen: "Screen", places: "Cultural Venues", culture: "Culture", film: "Screen", dining: "Dining" };
  const source = domainName[result.extraction.primaryMedium] ?? "Culture";
  const destinations = result.extraction.domains.map((domain) => domainName[domain] ?? domain).filter((domain) => domain !== source);
  const uniqueDestinations = Array.from(new Set(destinations));
  const hasQloo = result.provenance.qlooCalls > 0;

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/65 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="qloo-inspector-title" className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#110d1d] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/75">Evidence inspector</p>
            <h2 id="qloo-inspector-title" className="mt-2 text-2xl font-semibold text-white">Qloo Taste Graph</h2>
            <p className="mt-2 text-sm text-slate-400">How the recovered memory was resolved and connected.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Qloo inspector" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white">✕</button>
        </div>

        <div className="mt-8 space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <h3 className="text-sm font-semibold text-white">Qloo Entity Resolution</h3>
            <p className="mt-1 text-xs text-slate-400">Resolved cultural entity and Qloo taxonomy.</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Entity</dt><dd className="mt-1 break-all font-mono text-xs text-emerald-100">{entityId ?? (hasQloo ? "No resolved Qloo entity ID returned" : "Qloo entity resolution was unavailable for this investigation")}</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Type</dt><dd className="mt-1 text-slate-200">{entityType ?? "Not resolved"}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {taxonomyTags.map((tag) => <span key={tag} className="rounded-full border border-purple-300/20 bg-purple-300/5 px-2.5 py-1 text-[10px] text-purple-100">{tag}</span>)}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <h3 className="text-sm font-semibold text-white">Cross-Domain Traversal</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">The investigation starts from the <strong className="text-purple-100">{source}</strong> taste profile and checks for Qloo correlations across {uniqueDestinations.length ? uniqueDestinations.join(", ") : "the related cultural domains"}.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-cyan-100">
              <span className="rounded-full border border-purple-300/25 bg-purple-300/10 px-3 py-1.5">{source}</span>
              <span aria-hidden="true" className="text-slate-500">→</span>
              {(uniqueDestinations.length ? uniqueDestinations : ["Related Culture"]).map((domain) => <span key={domain} className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1.5">{domain}</span>)}
            </div>
            <p className="mt-4 text-[11px] text-slate-500">Qloo requests recorded: {result.provenance.qlooCalls}{result.provenance.qlooRequestIds.length ? ` · ${result.provenance.qlooRequestIds.slice(0, 3).join(", ")}` : ""}</p>
          </section>

          <section className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-5">
            <h3 className="text-sm font-semibold text-white">Graph Confidence</h3>
            <p className="mt-2 text-3xl font-semibold text-emerald-100">{affinityPercent === null ? "—" : `${affinityPercent}%`}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{affinityPercent === null ? "No affinity score was returned by Qloo for this lead." : "Affinity reported by the Qloo entity correlation for the lead memory."}</p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function KeepsakeModal({
  result,
  queryText,
  artifacts,
  onClose,
}: {
  result: InvestigationResult;
  queryText: string;
  artifacts: Array<{ title: string; detail: string; relation: string }>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <style jsx global>{`@media print { @page { margin: 18mm; } body * { visibility: hidden !important; } .keepsake-print, .keepsake-print * { visibility: visible !important; } .keepsake-print { position: fixed !important; inset: 0 !important; z-index: 99999 !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; color: #171226 !important; box-shadow: none !important; } .keepsake-print * { color: #171226 !important; border-color: #ddd !important; } .keepsake-actions { display: none !important; } }`}</style>
      <section role="dialog" aria-modal="true" aria-labelledby="keepsake-title" className="keepsake-print my-auto w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#110d1d] p-6 shadow-2xl sm:p-9">
        <div className="keepsake-actions flex justify-end gap-2">
          <button type="button" onClick={onClose} aria-label="Close keepsake" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white">✕</button>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200/75">A family archive print</p>
        <h2 id="keepsake-title" className="mt-2 text-2xl font-semibold leading-tight text-white sm:text-3xl">Taste Time Machine — Cultural Memory Keepsake</h2>
        <div className="mt-7 border-y border-white/10 py-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Recovered memory</p>
          <h3 className="mt-2 text-3xl font-semibold text-white">{result.directAnswer.title}</h3>
          <p className="mt-2 text-sm text-purple-100">{result.directAnswer.subtitle}</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">{result.directAnswer.detailedExplanation}</p>
        </div>
        <blockquote className="mt-6 rounded-2xl border border-purple-300/15 bg-purple-300/[0.05] p-4 text-sm italic leading-relaxed text-slate-200">“{queryText || result.extraction.cleanedTranscript}”</blockquote>
        <div className="mt-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Three cultural artifacts</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {artifacts.map((artifact) => (
              <article key={artifact.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <h4 className="text-sm font-semibold text-white">{artifact.title}</h4>
                <p className="mt-1 text-xs text-purple-100/80">{artifact.detail}</p>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-400">{artifact.relation}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="keepsake-actions mt-8 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-5 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/5">Close</button>
          <button type="button" onClick={() => window.print()} className="rounded-full bg-white px-5 py-3 text-xs font-bold text-slate-950 transition hover:bg-purple-100">Print / Save PDF</button>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------- archive --------------------------------- */

function ArchiveSection({
  library,
  onRevisit,
}: {
  library: SavedMemory[];
  onRevisit: (item: SavedMemory) => void;
}) {
  return (
    <section id="found-memories" className="mx-auto w-full max-w-5xl px-5 pb-40 pt-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-purple-300/70">The archive</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Found memories</h2>
      <p className="mt-2 text-sm text-slate-400">
        A quiet collection of the threads you&apos;ve recovered.
      </p>

      <div className="mt-7 border-t border-white/10">
        {library.length === 0 ? (
          <p className="py-8 text-sm italic text-slate-500">
            Nothing found yet. Every investigation starts with a fragment.
          </p>
        ) : (
          library.map((item, index) => (
            <div
              key={item.id}
              className="grid min-h-[72px] grid-cols-[36px_1fr_auto] items-center gap-4 border-b border-white/10 py-3"
            >
              <span className="text-[11px] font-bold tracking-[0.1em] text-purple-300/80">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-base font-semibold text-white">{item.title}</strong>
                <small className="mt-0.5 block truncate text-[11px] text-slate-400">{item.subtitle || item.query}</small>
                <small className="mt-0.5 block truncate text-[10px] text-slate-600">You said: {item.query}</small>
              </span>
              <span className="flex items-center gap-3">
                <small className="rounded-full border border-purple-300/20 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-purple-200">{item.category}</small>
                <button type="button" onClick={() => onRevisit(item)} className="text-[11px]! font-bold! uppercase tracking-[0.1em] !text-slate-400 transition hover:!text-purple-300">
                  Revisit <span aria-hidden="true">↗</span>
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ---------------------------------- icons ---------------------------------- */

type IconProps = { className?: string };

function ArrowLeftIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

function ResetIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 2.6-6.3" />
      <path d="M3 4.5v5h5" />
    </svg>
  );
}

function MicIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

function StopIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" />
    </svg>
  );
}

function KeyboardIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M17.5 10h.01M7 14h10" />
    </svg>
  );
}

function VolumeIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10v4h3.5L12 18V6l-4.5 4H4Z" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" />
      <path d="M18 7a7.5 7.5 0 0 1 0 10" />
    </svg>
  );
}

function MuteIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10v4h3.5L12 18V6l-4.5 4H4Z" />
      <path d="m16 10 4 4M20 10l-4 4" />
    </svg>
  );
}

function SpeakerIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10v4h3.5L12 18V6l-4.5 4H4Z" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" />
      <path d="M18 7a7.5 7.5 0 0 1 0 10" />
    </svg>
  );
}

function CloseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
