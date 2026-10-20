import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Data Access Layer: who is asking, and what they can do. Server-only. Pages use it for UX
 * (what to show); the database enforces the same rules again on every read and write.
 */

export type EventRole = "participant" | "mentor" | "judge" | "organiser";

export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  details: Record<string, unknown>;
}

export interface Viewer {
  userId: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  roles: EventRole[];
  team: { id: string; name: string; track: string | null; isCaptain: boolean } | null;
  registration: { ticket: "hackathon" | "panel"; status: string } | null;
}

/** The event the platform is currently running. Multi-event: switch with ACTIVE_EVENT_SLUG. */
export const ACTIVE_EVENT_SLUG = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";

export const getActiveEvent = cache(async (): Promise<EventSummary | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("events").select("id, slug, name, short_name, timezone, starts_at, ends_at, status, details").eq("slug", ACTIVE_EVENT_SLUG).maybeSingle();
  return (data as EventSummary | null) ?? null;
});

export const getViewer = cache(async (eventId?: string | null): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;
  const [profile, admin, roles, membership, registration] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    eventId ? supabase.from("event_roles").select("role").eq("event_id", eventId).eq("user_id", user.id) : Promise.resolve({ data: [] }),
    eventId ? supabase.from("team_members").select("role, teams(id, name, track)").eq("event_id", eventId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    eventId ? supabase.from("registrations").select("ticket, status").eq("event_id", eventId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const team = (membership.data as { role: string; teams: { id: string; name: string; track: string | null } | null } | null) ?? null;
  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: (profile.data?.display_name as string | undefined) || (user.email ?? "").split("@")[0],
    isPlatformAdmin: !!admin.data,
    roles: ((roles.data ?? []) as { role: EventRole }[]).map((r) => r.role),
    team: team?.teams ? { ...team.teams, isCaptain: team.role === "captain" } : null,
    registration: (registration.data as Viewer["registration"]) ?? null,
  };
});

export const hasRole = (v: Viewer | null, ...roles: EventRole[]) => !!v && (v.isPlatformAdmin || roles.some((r) => v.roles.includes(r)));
export const isOrganiser = (v: Viewer | null) => hasRole(v, "organiser");
