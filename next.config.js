/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  experimental: {
    optimizePackageImports: [],
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${backendUrl.replace(/\/+$/, "")}/:path*`,
      },
    ];
  },
};


const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      // Explicitly reject all authenticated APIs and private data from service worker cache
      urlPattern: /^https?:\/\/.*\/((api|auth|cases|evidence|audit|reports|notifications|admin|profile|search|public\/verify).*|.*\.(dat|bin|raw|pdf|mp4|zip|tar|gz))$/i,
      handler: "NetworkOnly",
    },
    {
      // Safe static assets (JS, CSS, static images, fonts)
      urlPattern: /\.(?:js|css|woff2?|ttf|eot|png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-assets-cache",
        expiration: { maxEntries: 80, maxAgeSeconds: 7 * 86400 },
      },
    },
    {
      // Next.js static build chunks
      urlPattern: /^\/_next\/static\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static-cache",
        expiration: { maxEntries: 100, maxAgeSeconds: 30 * 86400 },
      },
    },
  ],
});

module.exports = withPWA(nextConfig);

