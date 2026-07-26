import { LandingPage } from "@/components/landing/LandingPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Parisar — society management for Indian housing societies",
  description:
    "Notices, polls, complaints, amenity bookings and the resident directory in one app. Every action carries a name, a flat and a time.",
  keywords: [
    "society management",
    "housing society app",
    "apartment management India",
    "RWA software",
    "society complaints",
    "amenity booking",
  ],
  openGraph: {
    title: "Parisar — everything your society does, on the record",
    description:
      "Notices, polls, complaints, amenity bookings and the resident directory in one app. No gate hardware, no payments — on purpose.",
    siteName: "Parisar",
    locale: "en_IN",
    type: "website",
    images: [{ url: "/parisar-logo-512.png", width: 512, height: 512, alt: "Parisar" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Parisar — everything your society does, on the record",
    description: "Society management for Indian housing societies, in English, हिन्दी and मराठी.",
    images: ["/parisar-logo-512.png"],
  },
};

// Paints the browser chrome to match the page ground in each mode, so the
// address bar does not flash white above a dark page on mobile.
export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF6EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1F19" },
  ],
};

/**
 * `/` — the public front door.
 *
 * Replaces the Phase-1 "Hello {society}" verification screen, which redirected
 * anonymous visitors to /login and so left the product with no public page at all.
 *
 * `/` deliberately does NOT redirect signed-in users to /dashboard. Bouncing them
 * off your own marketing page means nobody with a session can ever look at it —
 * and when a downstream guard also redirects, the visitor lands somewhere
 * confusing (here: / → /dashboard → /login, while still signed in). Instead the
 * page always renders and simply swaps its call-to-action to "Go to dashboard".
 */
export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <LandingPage isSignedIn={Boolean(user)} />;
}
