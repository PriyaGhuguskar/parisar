"use client";

// PhotoGrid — 1–4 community-post photo thumbnails (web). UI-SPEC PostCard §PhotoGrid.
//   1 photo  → full-width 4:3
//   2 photos → two 1:1 halves
//   3–4      → 2×2 grid of 1:1 squares (3 leaves the last cell blank)
// Tap a thumbnail → shadcn Dialog lightbox (contain). Photos are decorative-with-
// fallback (alt="") — the post body communicates the content (a11y).
//
// `photos` is an array of signed URLs (signed SSR-side; the feed passes [] until a
// post's attachments are loaded on the detail screen).

import { useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * @param {{ photos: string[] }} props - signed URLs
 */
export function PhotoGrid({ photos = [] }) {
  const [lightbox, setLightbox] = useState(null);
  if (!photos || photos.length === 0) return null;

  const count = photos.length;
  const gridClass = count === 1 ? "grid-cols-1" : "grid-cols-2";

  return (
    <>
      <div className={`grid ${gridClass} gap-1`}>
        {photos.map((url, idx) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: photo URLs are positional and stable
            key={idx}
            type="button"
            onClick={() => setLightbox(url)}
            aria-label="Open photo full size"
            className="block w-full overflow-hidden rounded-lg bg-neutral-100"
            style={{ aspectRatio: count === 1 ? "4 / 3" : "1 / 1" }}
          >
            {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs not compatible with next/image */}
            <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-0 bg-black">
          <DialogTitle className="sr-only">Community post photo</DialogTitle>
          {lightbox ? (
            // biome-ignore lint/performance/noImgElement: signed Supabase URLs not compatible with next/image
            <img src={lightbox} alt="Community attachment" className="w-full h-auto" />
          ) : null}
          <DialogClose className="sr-only">Close</DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}
