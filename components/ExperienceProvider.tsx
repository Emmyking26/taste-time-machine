"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CaregiverReaction } from "@/lib/agent";
import type { PublicObservation, PublicSession, PublicWorld } from "@/lib/agent/present";
import { createProfile, generatePublicSession, reconstructWorld, sendFeedback } from "@/lib/ui/api";

export interface DraftPerson {
  name: string;
  birthYear: string;
  hometown: string;
  state: string;
  memories: string[];
}

interface ExperienceState {
  draft: DraftPerson;
  profileId: string | null;
  world: PublicWorld | null;
  session: PublicSession | null;
  previousSession: PublicSession | null;
  observations: PublicObservation[];
  previousObservations: PublicObservation[];
  itemIndex: number;
  busy: boolean;
  error: string | null;
  agitatedSkip: boolean;
}

interface ExperienceContextValue extends ExperienceState {
  setDraft: (draft: DraftPerson) => void;
  createAndReconstruct: (draft: DraftPerson) => Promise<PublicWorld>;
  startSession: () => Promise<PublicSession>;
  startNextSession: () => Promise<PublicSession>;
  recordReaction: (reaction: CaregiverReaction) => Promise<void>;
  advanceItem: () => void;
  stopSession: () => void;
  clearAgitatedSkip: () => void;
  resetPlayhead: () => void;
}

const DEFAULT_DRAFT: DraftPerson = {
  name: "",
  birthYear: "",
  hometown: "",
  state: "",
  memories: ["", "", ""],
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<DraftPerson>(DEFAULT_DRAFT);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [world, setWorld] = useState<PublicWorld | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [previousSession, setPreviousSession] = useState<PublicSession | null>(null);
  const [observations, setObservations] = useState<PublicObservation[]>([]);
  const [previousObservations, setPreviousObservations] = useState<PublicObservation[]>([]);
  const [itemIndex, setItemIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agitatedSkip, setAgitatedSkip] = useState(false);

  const value = useMemo<ExperienceContextValue>(
    () => ({
      draft,
      profileId,
      world,
      session,
      previousSession,
      observations,
      previousObservations,
      itemIndex,
      busy,
      error,
      agitatedSkip,
      setDraft,
      async createAndReconstruct(nextDraft) {
        setBusy(true);
        setError(null);
        try {
          const memories = nextDraft.memories.map((item) => item.trim()).filter(Boolean);
          const person = await createProfile({
            name: nextDraft.name.trim(),
            birthYear: Number(nextDraft.birthYear),
            hometown: nextDraft.hometown.trim(),
            state: nextDraft.state.trim(),
            memories,
          });
          setProfileId(person.id);
          setDraft(nextDraft);
          const nextWorld = await reconstructWorld(person.id);
          setWorld(nextWorld);
          setSession(null);
          setPreviousSession(null);
          setObservations([]);
          setPreviousObservations([]);
          setItemIndex(0);
          return nextWorld;
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "We could not reconstruct their world.";
          setError(message);
          throw caught;
        } finally {
          setBusy(false);
        }
      },
      async startSession() {
        if (!profileId) throw new Error("Create a memory profile first.");
        setBusy(true);
        setError(null);
        try {
          const next = await generatePublicSession(profileId);
          setPreviousSession(null);
          setSession(next);
          setObservations([]);
          setItemIndex(0);
          return next;
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "The session could not be prepared.";
          setError(message);
          throw caught;
        } finally {
          setBusy(false);
        }
      },
      async startNextSession() {
        if (!profileId || !session) throw new Error("Finish the first session first.");
        setBusy(true);
        setError(null);
        try {
          const next = await generatePublicSession(profileId);
          setPreviousSession(session);
          setPreviousObservations(observations);
          setSession(next);
          setObservations([]);
          setItemIndex(0);
          return next;
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "The next session could not be prepared.";
          setError(message);
          throw caught;
        } finally {
          setBusy(false);
        }
      },
      async recordReaction(reaction) {
        if (!profileId || !session) return;
        const item = session.items[itemIndex];
        if (!item) return;
        setBusy(true);
        setError(null);
        try {
          await sendFeedback(profileId, session.id, item.id, reaction);
          setObservations((current) => [
            ...current.filter((entry) => entry.sessionItemId !== item.id),
            {
              sessionItemId: item.id,
              title: item.title,
              reaction,
              reactionLabel:
                reaction === "lit_up"
                  ? "Lit up"
                  : reaction === "calm"
                    ? "Calm"
                    : reaction === "engaged"
                      ? "Engaged"
                      : reaction === "agitated"
                        ? "Became agitated"
                        : "No clear response",
            },
          ]);
          if (reaction === "agitated") setAgitatedSkip(true);
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "The observation could not be saved.";
          setError(message);
          throw caught;
        } finally {
          setBusy(false);
        }
      },
      advanceItem() {
        setAgitatedSkip(false);
        setItemIndex((current) => current + 1);
      },
      stopSession() {
        setAgitatedSkip(false);
        if (session) setItemIndex(session.items.length);
      },
      clearAgitatedSkip() {
        setAgitatedSkip(false);
      },
      resetPlayhead() {
        setItemIndex(0);
        setAgitatedSkip(false);
      },
    }),
    [
      agitatedSkip,
      busy,
      draft,
      error,
      itemIndex,
      observations,
      previousObservations,
      previousSession,
      profileId,
      session,
      world,
    ],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience(): ExperienceContextValue {
  const context = useContext(ExperienceContext);
  if (!context) throw new Error("useExperience must be used within ExperienceProvider");
  return context;
}
