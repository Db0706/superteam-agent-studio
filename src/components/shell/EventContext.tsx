"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { EVENTS, getEvent, isEventId } from "@/config/events";
import type { EventConfig } from "@/config/schema";
import { SITE } from "@/config/site";

const STORAGE_KEY = "agent-studio:event";

interface EventCtx {
  event: EventConfig;
  events: EventConfig[];
  setEventId: (id: string) => void;
}

const Ctx = createContext<EventCtx | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Selected hackathon event. Persisted in `?event=` (so links are shareable)
 * and in localStorage (so it survives navigation). No server involvement.
 */
export function EventProvider({ children }: { children: ReactNode }) {
  const [eventId, setId] = useState<string>(SITE.defaultEventId);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("event");
    const initial = isEventId(fromUrl) ? fromUrl : readStored();
    // Restoring a persisted preference after hydration; the server always renders the default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isEventId(initial)) setId(initial);
  }, []);

  const setEventId = useCallback((id: string) => {
    if (!isEventId(id)) return;
    setId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
    const url = new URL(window.location.href);
    if (id === SITE.defaultEventId) url.searchParams.delete("event");
    else url.searchParams.set("event", id);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return <Ctx.Provider value={{ event: getEvent(eventId), events: EVENTS, setEventId }}>{children}</Ctx.Provider>;
}

export function useEvent(): EventCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEvent must be used inside <EventProvider>");
  return c;
}
