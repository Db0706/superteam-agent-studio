"use server";

import { loadControlState, type ControlState } from "@/server/dal/control";

/** Fresh control-room state for polling (organisers only, enforced by RLS). */
export async function fetchControlState(id: string): Promise<ControlState | null> {
  return loadControlState(id);
}
