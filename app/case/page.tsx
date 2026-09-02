"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyCaseRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/cases");
  }, [router]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", color: "#6b7280" }}>
      <p>Redirecting to cases registry…</p>
    </div>
  );
}