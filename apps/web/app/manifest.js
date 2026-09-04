// Web App Manifest — this is what makes Parisar installable to a phone's home
// screen and launch WITHOUT browser chrome (no URL bar, no tabs). For a product
// whose users are residents on budget Android handsets, install-to-home-screen
// is the difference between "a website the committee sent a link to" and "the
// society app on my phone" — and it costs nothing next to an app-store build.
//
// display:"standalone" is the line that removes the browser UI.
// Next.js serves this at /manifest.webmanifest automatically.

export default function manifest() {
  return {
    name: "Parisar — society management",
    short_name: "Parisar",
    description:
      "Notices, polls, complaints, amenity bookings and the resident directory for your housing society.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches the landing hero ground and the app surface, so the system UI
    // (status bar, splash) does not flash a foreign colour on launch.
    background_color: "#FBF6EE",
    theme_color: "#12715A",
    lang: "en",
    dir: "ltr",
    categories: ["productivity", "lifestyle", "social"],
    // "maskable" is a SEPARATE asset with ~10% padding baked in: Android crops
    // every icon to its own shape (circle, squircle, teardrop), so a mark that
    // fills the square edge-to-edge gets its leaf clipped off.
    icons: [
      { src: "/parisar-mark-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/parisar-mark-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/parisar-mark-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
