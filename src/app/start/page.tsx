import type { Metadata } from "next";
import { FirstTenMinutes } from "@/components/start/FirstTenMinutes";

export const metadata: Metadata = {
  title: "First 10 minutes",
  description: "From a downloaded ZIP to your first paid request on Solana devnet. No crypto experience needed, and no real money.",
};

export default function StartPage() {
  return <FirstTenMinutes />;
}
