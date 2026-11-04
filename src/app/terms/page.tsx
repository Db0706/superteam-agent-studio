import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of use", description: "The rules for using Agent Studio." };

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="TERMS OF USE"
      title="Terms."
      updated="4 November 2026"
      intro={<p className="m-0">Agent Studio is a free platform for running hackathons and AI Races at Superteam UK events. By using it you agree to these terms.</p>}
      sections={[
        { heading: "Using the platform", body: <p className="m-0">Use it to take part in, mentor, judge or organise an event. Don&apos;t try to break, overload or get around its checks, access other teams&apos; data, or use it for anything unlawful.</p> },
        { heading: "Your work", body: <p className="m-0">Your team owns what it builds and submits. You let the event show your project title, description, links, team name and members&apos; display names on the leaderboard and winners page.</p> },
        { heading: "Test money only", body: <p className="m-0">Payments in the starters and the AI Race use Solana <b>devnet</b>, which is test money worth nothing. Never put a real wallet key or real funds into anything on this site.</p> },
        { heading: "Results", body: <p className="m-0">Race points come from automatic checks; organisers can correct them. Track winners are decided by the judging panel and the organisers, whose decision is final.</p> },
        { heading: "No warranty", body: <p className="m-0">The platform is provided as it is, for events. We do our best to keep it running and accurate but can&apos;t promise it will always be available or error-free.</p> },
        { heading: "Changes and contact", body: <p className="m-0">We may update these terms; the date above shows the latest version. Questions: contact the event organisers. See also the <Link href="/privacy">privacy policy</Link>.</p> },
      ]}
    />
  );
}
