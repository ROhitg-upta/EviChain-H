import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./design-tokens.css";
import "./components.css";
import "./globals.css";
import { AuthProvider } from "./auth-context";
import { NotificationProvider } from "./notification-context";
import ToastContainer from "./components/toast-container";
import CommandPalette from "./components/command-palette";
import InstallPWAPrompt from "./components/install-pwa-prompt";
import ErrorBoundary from "./components/error-boundary";



const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | EviChain",
    default: "EviChain — Evidence Integrity Platform",
  },
  description: "SHA-256 verified chain-of-custody evidence management for investigative teams.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EviChain",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f845a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <AuthProvider>
          <NotificationProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
            <ToastContainer />
            <CommandPalette />
            <InstallPWAPrompt />
          </NotificationProvider>


        </AuthProvider>
      </body>
    </html>
  );
}

