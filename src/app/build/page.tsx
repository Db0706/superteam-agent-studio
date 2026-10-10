import type { Metadata } from "next";
import { ProjectBuilder } from "@/components/builder/ProjectBuilder";

export const metadata: Metadata = {
  title: "Project Builder",
  description: "Pick a framework and capabilities and see exactly what your starter project contains.",
};

export default function BuildPage() {
  return <ProjectBuilder />;
}
