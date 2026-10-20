import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveEvent, getViewer, hasRole } from "@/server/dal/viewer";

/** Header account area: sign-in link, or the user's name, role shortcuts and sign-out. */
export async function AccountMenu() {
  if (!isSupabaseConfigured()) return null;
  const event = await getActiveEvent();
  const viewer = await getViewer(event?.id);
  const link = "font-mono text-[11px] font-medium !text-[#EDEDE8]";
  if (!viewer) {
    return (
      <Link href="/login" className={link}>
        SIGN IN
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {hasRole(viewer, "mentor") && (
        <Link href="/mentor" className={link}>
          MENTOR
        </Link>
      )}
      {hasRole(viewer, "judge") && (
        <Link href="/judge" className={link}>
          JUDGE
        </Link>
      )}
      {hasRole(viewer, "organiser") && (
        <Link href="/admin" className={link}>
          ADMIN
        </Link>
      )}
      <Link href="/team" className={`${link} max-w-[140px] truncate`} title={viewer.email}>
        {viewer.team ? viewer.team.name.toUpperCase() : viewer.displayName.toUpperCase()}
      </Link>
      <form action="/auth/signout" method="post">
        <button type="submit" className="border-0 bg-transparent p-0 font-mono text-[11px] font-medium text-dim-2 hover:text-white">
          SIGN OUT
        </button>
      </form>
    </div>
  );
}
