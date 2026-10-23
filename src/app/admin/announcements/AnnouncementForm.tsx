"use client";

import { useActionState } from "react";
import { Module } from "@/components/system";
import { publishAnnouncement } from "./actions";

export function AnnouncementForm() {
  const [state, action, pending] = useActionState(publishAnnouncement, null);
  return (
    <Module label="NEW ANNOUNCEMENT" right="PUBLISHES NOW">
      <form action={action} className="flex flex-col gap-3 p-4 text-[13px]">
        <label className="flex flex-col gap-1 font-semibold">
          Title
          <input name="title" required maxLength={140} className="h-10 rounded-[3px] border border-[#CFCFC8] bg-white px-3 text-[14px] font-normal" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Message (optional)
          <textarea name="body" rows={4} maxLength={2000} className="rounded-[3px] border border-[#CFCFC8] bg-white px-3 py-2 text-[14px] font-normal" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Who sees it
          <select name="audience" defaultValue="everyone" className="h-10 rounded-[3px] border border-[#CFCFC8] bg-white px-2 text-[14px] font-normal">
            <option value="everyone">Everyone, including the venue screen</option>
            <option value="participants">Participants</option>
            <option value="mentors">Mentors</option>
            <option value="judges">Judges</option>
            <option value="organisers">Organisers</option>
          </select>
        </label>
        <button type="submit" disabled={pending} className="btn-primary self-start !h-11 !px-5 !text-[14px]">
          {pending ? "Publishing…" : "Publish"}
        </button>
        {state && !state.ok && <p role="alert" className="m-0 text-fault">{state.error}</p>}
        {state?.ok && <p role="status" className="m-0 text-ok-text">Published.</p>}
      </form>
    </Module>
  );
}
