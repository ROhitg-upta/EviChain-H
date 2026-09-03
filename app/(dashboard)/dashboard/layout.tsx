"use client";
import type { ReactNode } from "react";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
