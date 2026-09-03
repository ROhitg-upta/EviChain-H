"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main
          className="cases-shell"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "70vh",
            padding: "2rem",
            textAlign: "center",
          }}
          role="alert"
          aria-live="assertive"
        >
          <div
            className="brand-mark"
            style={{
              width: 56,
              height: 56,
              fontSize: 28,
              marginBottom: 16,
              background: "#ef4444",
            }}
          >
            !
          </div>
          <p className="eyebrow" style={{ color: "#ef4444" }}>
            SYSTEM RECOVERY
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "8px 0 12px" }}>
            An unexpected error occurred
          </h1>
          <p
            style={{
              maxWidth: 480,
              color: "var(--text-secondary, #6b7280)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {this.state.error?.message ||
              "A client rendering error occurred while displaying this view."}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              className="button button-primary"
              onClick={this.handleReset}
            >
              Try again
            </button>
            <a href="/dashboard" className="button button-secondary">
              Go to Dashboard
            </a>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => window.location.reload()}
            >
              Reload application
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
