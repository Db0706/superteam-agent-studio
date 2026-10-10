import type { Metadata } from "next";
import { Inspiration } from "@/components/inspiration/Inspiration";

export const metadata: Metadata = {
  title: "Inspiration",
  description: "250 offline project ideas across 26 industries. Filter, shuffle and find something worth building.",
};

export default function InspirationPage() {
  return <Inspiration />;
}
