import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy without nonces (nonces would force every page to render dynamically).
 * 'unsafe-inline' scripts are required by Next's inline hydration scripts in that mode; the policy still
 * limits where the page may connect (only this app and the Supabase project, incl. its Realtime
 * websocket), forbids plugins, framing, <base> hijacking and posting forms to other sites.
 */
function contentSecurityPolicy(): string {
  const connect = ["'self'"];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const { host, protocol } = new URL(supabaseUrl);
      connect.push(`${protocol}//${host}`, `${protocol === "http:" ? "ws:" : "wss:"}//${host}`);
    } catch {
      // Malformed URL: leave Supabase out; the app's own env check reports the bad config.
    }
  }
  if (isDev) connect.push("ws:", "wss:"); // dev server hot reload

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The memory browser used to be called "Explorer"; keep old links working.
  redirects() {
    return [
      { source: "/explorer", destination: "/memories", permanent: true },
      { source: "/explorer/:id", destination: "/memories/:id", permanent: true },
    ];
  },
};

export default nextConfig;
