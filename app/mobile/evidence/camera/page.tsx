"use client";

import { useRef, useState } from "react";
import { useAuth } from "../../../auth-context";
import { useNotifications } from "../../../notification-context";
import { uploadEvidence } from "@/lib/api";

export default function CameraCapturePage() {
  const { accessToken } = useAuth();
  const { toast } = useNotifications();
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [streaming, setStreaming] = useState(false);
  const [capturing, setCapturing] = useState(false);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreaming(true);
      }
    } catch {
      toast({ type: "error", title: "Camera access denied", message: "Enable camera permissions and try again." });
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setStreaming(false);
  }

  async function toggleCamera() {
    stopCamera();
    setFacingMode((p) => p === "user" ? "environment" : "user");
    setTimeout(startCamera, 150);
  }

  async function handleCapture() {
    if (!videoRef.current || !canvasRef.current || !accessToken) return;
    setCapturing(true);

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) { setCapturing(false); return; }
      try {
        const fd = new FormData();
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        fd.append("file",     file);
        fd.append("name",     file.name);
        fd.append("type",     "JPG");
        fd.append("ownerOrg", "Mobile Capture");
        await uploadEvidence(accessToken, fd);
        toast({ type: "success", title: "Photo uploaded", message: "Evidence registered successfully." });
      } catch (err: unknown) {
        toast({ type: "error", title: err instanceof Error ? err.message : "Upload failed" });
      } finally {
        setCapturing(false);
      }
    }, "image/jpeg", 0.9);
  }

  return (
    <div className="camera-page">
      <div className="camera-viewfinder">
        <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      <div className="camera-controls">
        <button className="camera-btn" onClick={toggleCamera} aria-label="Flip camera">⇄</button>
        <button
          className="camera-btn camera-capture"
          onClick={streaming ? handleCapture : startCamera}
          disabled={capturing}
          aria-label={streaming ? "Capture photo" : "Start camera"}
        >
          <span className="capture-circle" />
        </button>
        <a className="camera-btn" href="/evidence/new" aria-label="Upload from gallery">↑</a>
      </div>

      {!streaming && (
        <div className="camera-permission-prompt">
          <h3>Enable camera</h3>
          <p>Allow camera access to capture evidence photos</p>
          <button className="btn btn-primary btn-lg" onClick={startCamera}>Enable camera</button>
        </div>
      )}
    </div>
  );
}
