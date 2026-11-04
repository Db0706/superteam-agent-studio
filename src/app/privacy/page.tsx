import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy", description: "What Agent Studio collects, why, and how Google data is used." };

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="PRIVACY POLICY"
      title="Privacy."
      updated="4 November 2026"
      intro={<p className="m-0">Agent Studio runs hackathons and AI Races for Superteam UK events, such as the Oxford and Cambridge AI Race. This page explains what it collects and why. Plain English, no surprises.</p>}
      sections={[
        {
          heading: "What we collect",
          body: (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              <li>Your <b>email address</b>, to send sign-in codes. There are no passwords.</li>
              <li>Your <b>display name</b> and <b>university</b>, and the <b>team</b> you join.</li>
              <li>What your team <b>submits</b>: project title, description, links (repository, demo, documents).</li>
              <li>For the AI Race: your app&apos;s public address, the results of each automatic check, and any Solana <b>devnet</b> (test money) wallet address you register.</li>
              <li>For judges: the scores and comments they enter.</li>
            </ul>
          ),
        },
        {
          heading: "What is shown publicly",
          body: <p className="m-0">Team names, members&apos; display names, universities, race points and the winning projects appear on the leaderboard and the winners page. Email addresses are never shown publicly.</p>,
        },
        {
          heading: "Google data",
          body: (
            <>
              <p className="m-0">Organisers can connect a Google account so the site can create a judging spreadsheet. The site asks for only two things: your email address (to show which account is connected) and the <b>drive.file</b> permission, which lets it see and edit <b>only the files it creates itself</b>. It cannot see any other file in your Google Drive.</p>
              <p className="m-0">The site uses this to create the judging sheet, share it with the event&apos;s judges, and read the scores and places back to publish the winners. Google access is stored encrypted, is never sold or shared, is not used for advertising, and is not used to train AI models.</p>
              <p className="m-0">Agent Studio&apos;s use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
              <p className="m-0">You can disconnect at any time from Admin → Judging, or at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</p>
            </>
          ),
        },
        {
          heading: "Where it is stored",
          body: <p className="m-0">The database is hosted by Supabase in the EU (Ireland). The website runs on Vercel. Sign-in emails are sent through Resend. Race checks run on servers in the EU.</p>,
        },
        {
          heading: "How long we keep it, and your rights",
          body: <p className="m-0">Event data is kept so results stay available after the event. You can ask for your data to be corrected or deleted at any time by contacting the event organisers, and we will do it.</p>,
        },
        {
          heading: "Contact",
          body: (
            <p className="m-0">
              Contact the organisers through the event page, for example the <a href="https://luma.com/Oxbridge-AI-Race" target="_blank" rel="noopener noreferrer">Oxford and Cambridge AI Race on Luma</a>. See also the <Link href="/terms">terms of use</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
