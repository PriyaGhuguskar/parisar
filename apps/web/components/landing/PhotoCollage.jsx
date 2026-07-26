"use client";

// Hero photo collage — two staggered columns of society life.
//
// WHY THIS EXISTS: the page previously had no photography at all, which made it
// read as a developer tool next to consumer society apps whose pages are carried
// by pictures of actual residents. Type and colour cannot substitute for faces.
//
// The offset second column is deliberate: a flush 2x3 grid reads as a stock
// gallery, while staggered columns bleeding past the top and bottom edges read
// as a window onto something continuing beyond the frame. The tiles are also
// intentionally uneven in height so the eye travels rather than scanning a table.
//
// TEMPORARY ASSETS: these are freely-licensed Wikimedia Commons photographs,
// credited in public/photos/CREDITS.json. Several are CC BY-SA, which carries
// attribution and share-alike obligations — see the footer credit link. They are
// placeholders for art-directed photography: swap the files in public/photos/
// and nothing here needs to change, since every tile is referenced by name only.

import Image from "next/image";

// Column A leads; column B is pushed down so the two never align into a grid.
const COL_A = [
  { src: "/photos/life-1.webp", h: 168, alt: "" }, // rangoli + diyas at a doorstep
  { src: "/photos/people-1.webp", h: 228, alt: "" }, // a resident's child, smiling
  { src: "/photos/life-3.webp", h: 156, alt: "" }, // kids playing cricket
];
const COL_B = [
  { src: "/photos/community-1.webp", h: 210, alt: "" }, // festival lights on a building
  { src: "/photos/life-4.webp", h: 162, alt: "" }, // Ganesh Chaturthi in the street
  { src: "/photos/life-2.webp", h: 196, alt: "" }, // Holi colour, neighbours together
];

function Tile({ src, alt, h, priority }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-[18px]"
      style={{ height: h, boxShadow: "0 18px 40px -22px rgba(0,0,0,.75)" }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 1024px) 42vw, 200px"
        className="object-cover"
      />
    </div>
  );
}

export function PhotoCollage() {
  return (
    // aria-hidden: the photographs are atmosphere, not information. Every fact
    // on this page is in the text; announcing six empty-alt images would only
    // add noise to a screen reader.
    <div
      aria-hidden="true"
      className="pointer-events-none grid select-none grid-cols-2 gap-3 sm:gap-4"
    >
      <div className="pk-par-a flex flex-col gap-3 sm:gap-4">
        {COL_A.map((t, i) => (
          <Tile key={t.src} {...t} priority={i === 0} />
        ))}
      </div>
      {/* The offset. Nothing else on the page uses an odd translate — it earns
          it by turning a grid into a glimpse. */}
      <div className="pk-par-b flex translate-y-8 flex-col gap-3 sm:translate-y-12 sm:gap-4">
        {COL_B.map((t, i) => (
          <Tile key={t.src} {...t} priority={i === 0} />
        ))}
      </div>
    </div>
  );
}
