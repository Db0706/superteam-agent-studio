import type { Metadata } from "next";
import { Playground } from "@/components/playground/Playground";

export const metadata: Metadata = {
  title: "Playground",
  description: "A simulated AI agent finds a paid service, checks its budget and pays, step by step. No real payments or AI calls.",
};

export default function PlaygroundPage() {
  return <Playground />;
}
