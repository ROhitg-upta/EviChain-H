"use client";

import { useEffect, useState } from "react";

export default function InstallPWAPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!localStorage.getItem("pwa-installed")) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      localStorage.setItem("pwa-installed", "true");
      setShowPrompt(false);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prompt = deferredPrompt as any;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") localStorage.setItem("pwa-installed", "true");
    setShowPrompt(false);
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem("pwa-installed", "true");
    setShowPrompt(false);
  }

  if (!showPrompt) return null;

  return (
    <div className="pwa-install-prompt" role="dialog" aria-label="Install EviChain app">
      <div className="pwa-prompt-content">
        <div className="pwa-prompt-icon" aria-hidden="true">E</div>
        <div className="pwa-prompt-text">
          <h3>Install EviChain</h3>
          <p>Faster access and offline support</p>
        </div>
        <div className="pwa-prompt-actions">
          <button className="btn btn-primary btn-sm" onClick={handleInstall}>Install</button>
          <button className="btn btn-ghost btn-sm" onClick={handleDismiss}>Later</button>
        </div>
      </div>
    </div>
  );
}
