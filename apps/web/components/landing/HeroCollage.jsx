"use client";

// Hero collage — six animated scenes, alternating society life and live product.
//
// WHY THIS REPLACED THE PHOTOGRAPHY: the previous tiles were Wikimedia stock.
// Two of them were liabilities rather than art direction — a CC BY-SA 4.0
// rangoli (share-alike obligations on a commercial marketing page) and a
// photograph of a real, identifiable child presented as "a resident's child".
// Original vector art retires both problems, weighs ~15 KB instead of 1.4 MB,
// stays crisp at any density, and — the actual point — moves.
//
// THE MIX IS DELIBERATE. Three tiles are warm scenes of society life (rangoli,
// diyas, a tower waking up at dusk) and three are the product doing its job (a
// notice fanning out to flats, a complaint walking its status trail, a poll
// settling). Life alone decorates; product alone reads as a dashboard
// screenshot. Alternating them across the two columns says "this is your
// society" and "this is the app" in a single glance.
//
// NO TRANSLATABLE COPY LIVES HERE. At ~200px wide, real sentences would be
// illegible anyway, so the product cards use skeleton bars for prose and show
// only locale-neutral tokens: flat numbers (A-101 is A-101 in every language)
// and numerals. That keeps the tiles honest in en/hi/mr without a single key.
//
// Motion primitives are in app/globals.css under "HERO COLLAGE ART" — all
// transform/opacity, all offset onto their own clocks so nothing marches in
// step, and all frozen into a legible pose under prefers-reduced-motion.

// Warm palette, tuned to sit on the dark green hero ground.
const C = {
  ground: "#0C2119",
  groundLo: "#081A14",
  card: "#12362A",
  line: "rgba(255,255,255,.14)",
  mint: "#5FCFA6",
  green: "#1E8F72",
  marigold: "#F0B45E",
  amber: "#E8A33D",
  coral: "#E4572E",
  plum: "#8E7BC4",
  cream: "#FBF6EE",
  dim: "rgba(251,246,238,.55)",
};

/* -------------------------------------------------------------------------- */
/* Tile shell — rounded frame, shadow, and its own float phase.               */
/* -------------------------------------------------------------------------- */

function Tile({ h, dur, delay, children }) {
  return (
    <div
      className="pk-art relative w-full overflow-hidden rounded-[18px]"
      style={{
        height: h,
        boxShadow: "0 18px 40px -22px rgba(0,0,0,.75)",
        "--pk-art-dur": dur,
        "--pk-art-delay": delay,
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* LIFE — rangoli drawing its rings at a doorstep.                            */
/* -------------------------------------------------------------------------- */

function RangoliTile() {
  // Twelve outer petals, eight inner. Built from a rotation list rather than
  // hand-placed so the spacing cannot drift.
  const outer = Array.from({ length: 12 }, (_, i) => i * 30);
  const inner = Array.from({ length: 8 }, (_, i) => i * 45);

  return (
    <svg viewBox="0 0 200 168" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true" role="presentation">
      <defs>
        <radialGradient id="rangoliGround" cx="50%" cy="46%" r="70%">
          <stop offset="0%" stopColor="#153A2C" />
          <stop offset="100%" stopColor={C.groundLo} />
        </radialGradient>
      </defs>
      <rect width="200" height="168" fill="url(#rangoliGround)" />

      <g transform="translate(100 78)">
        {/* Outer ring turns one way… */}
        <g className="pk-art-spin">
          {outer.map((deg, i) => (
            // POSITION ON THE PARENT, ANIMATION ON THE CHILD. A CSS transform
            // in a keyframe overrides an SVG transform="" attribute on the same
            // node, so putting rotate() and the scale animation together would
            // collapse every petal onto one spot. This split is load-bearing.
            <g key={`o-${deg}`} transform={`rotate(${deg})`}>
              <ellipse
                className="pk-art-petal"
                style={{ "--d": `${i * 130}ms` }}
                cx="0"
                cy="-44"
                rx="7"
                ry="15"
                fill={i % 3 === 0 ? C.coral : i % 3 === 1 ? C.plum : C.marigold}
                opacity=".9"
              />
            </g>
          ))}
        </g>

        {/* …the inner ring the other, so the figure never reads as a wheel. */}
        <g className="pk-art-spin-r">
          {inner.map((deg, i) => (
            <g key={`i-${deg}`} transform={`rotate(${deg})`}>
              <ellipse
                className="pk-art-petal"
                style={{ "--d": `${i * 170 + 80}ms` }}
                cx="0"
                cy="-24"
                rx="5.5"
                ry="10"
                fill={i % 2 === 0 ? C.mint : C.cream}
                opacity=".85"
              />
            </g>
          ))}
        </g>

        <circle className="pk-art-glow" cx="0" cy="0" r="13" fill={C.marigold} opacity=".4" />
        <circle cx="0" cy="0" r="6" fill={C.marigold} />
        <circle cx="0" cy="0" r="2.6" fill={C.cream} />
      </g>

      {/* Two diyas flanking the doorstep. */}
      {[
        { x: 34, d: "0ms" },
        { x: 166, d: "620ms" },
      ].map((p) => (
        <g key={p.x} transform={`translate(${p.x} 142)`}>
          <ellipse className="pk-art-glow" style={{ "--d": p.d }} cx="0" cy="-6" rx="15" ry="11" fill={C.amber} opacity=".32" />
          <path d="M-11 0 Q0 9 11 0 Z" fill={C.coral} />
          <path
            className="pk-art-flame"
            style={{ "--d": p.d }}
            d="M0 -3 C4 -8 3.4 -14 0 -18 C-3.4 -14 -4 -8 0 -3 Z"
            fill={C.marigold}
          />
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* PRODUCT — a notice posts, then fans out to every flat.                     */
/* -------------------------------------------------------------------------- */

function NoticeTile() {
  const flats = ["A-101", "A-102", "B-203", "C-304"];

  return (
    <svg viewBox="0 0 200 228" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true" role="presentation">
      <rect width="200" height="228" fill={C.ground} />

      {/* The notice itself. */}
      <g transform="translate(16 18)">
        <rect width="168" height="76" rx="12" fill={C.card} stroke={C.line} />
        {/* pin */}
        <circle cx="20" cy="22" r="9" fill={C.mint} opacity=".18" />
        <path
          d="M20 17.5 a4 4 0 0 1 4 4 c0 3-4 6.5-4 6.5 s-4-3.5-4-6.5 a4 4 0 0 1 4-4 z"
          fill={C.mint}
        />
        {/* headline + body, as skeleton bars (see file header on why not text) */}
        <rect x="36" y="16" width="86" height="7" rx="3.5" fill={C.cream} opacity=".92" />
        <rect x="36" y="29" width="54" height="5" rx="2.5" fill={C.dim} />
        <rect x="16" y="48" width="136" height="5" rx="2.5" fill={C.dim} opacity=".7" />
        <rect x="16" y="59" width="98" height="5" rx="2.5" fill={C.dim} opacity=".45" />
      </g>

      {/* Attribution — the product's whole thesis is that actions carry a name
          and a flat, so the byline chip is drawn rather than skeletoned. */}
      <g transform="translate(16 104)">
        <rect width="92" height="20" rx="10" fill={C.green} opacity=".26" />
        <circle cx="12" cy="10" r="6" fill={C.mint} />
        <text x="24" y="14" fontSize="9" fontWeight="700" fill={C.cream} fontFamily="inherit">
          B-203
        </text>
      </g>

      {/* Fan-out lines from the notice down to each flat chip. */}
      <g stroke={C.mint} strokeWidth="1.2" fill="none" opacity=".38">
        <path d="M100 128 C100 142 40 142 40 156" />
        <path d="M100 128 C100 142 87 142 87 156" />
        <path d="M100 128 C100 142 133 142 133 156" />
        <path d="M100 128 C100 148 176 146 176 168" />
      </g>

      {/* Flat chips lighting up one after another as the notice lands. */}
      {flats.map((f, i) => {
        const pos = [
          { x: 14, y: 158 },
          { x: 62, y: 158 },
          { x: 110, y: 158 },
          { x: 62, y: 188 },
        ][i];
        return (
          // Position outside, animation inside — same rule as the rangoli.
          <g key={f} transform={`translate(${pos.x} ${pos.y})`}>
            <g className="pk-art-chip" style={{ "--d": `${i * 420}ms` }}>
              <rect
                width="46"
                height="22"
                rx="11"
                fill={C.card}
                stroke={C.mint}
                strokeOpacity=".5"
              />
              <text
                x="23"
                y="15"
                fontSize="9"
                fontWeight="700"
                textAnchor="middle"
                fill={C.mint}
                fontFamily="inherit"
              >
                {f}
              </text>
            </g>
          </g>
        );
      })}

      {/* delivered tick */}
      <g transform="translate(126 188)">
        <g className="pk-art-chip" style={{ "--d": "1700ms" }}>
          <circle cx="11" cy="11" r="11" fill={C.green} />
          <path
            d="M6 11.5 l3.4 3.4 L16 8"
            stroke={C.cream}
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* LIFE — the courtyard: kids, a ball arcing, evening light.                   */
/* -------------------------------------------------------------------------- */

function CourtyardTile() {
  return (
    <svg viewBox="0 0 200 156" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true" role="presentation">
      <defs>
        <linearGradient id="courtSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A4232" />
          <stop offset="100%" stopColor={C.groundLo} />
        </linearGradient>
      </defs>
      <rect width="200" height="156" fill="url(#courtSky)" />

      {/* far trees, flat silhouettes so they stay background */}
      <g fill="#0A2018" opacity=".85">
        <circle cx="26" cy="86" r="20" />
        <circle cx="46" cy="92" r="15" />
        <circle cx="172" cy="88" r="18" />
      </g>

      {/* ground */}
      <rect y="118" width="200" height="38" fill="#0A1F17" />
      <path d="M0 118 H200" stroke={C.mint} strokeOpacity=".22" strokeWidth="1.5" />

      {/* stumps */}
      <g stroke={C.marigold} strokeWidth="2.2" strokeLinecap="round" opacity=".85">
        <path d="M150 118 V100" />
        <path d="M156 118 V100" />
        <path d="M162 118 V100" />
      </g>

      {/* two kids, deliberately simple — a silhouette reads at 200px, a face
          does not, and a drawn face would only re-import the consent problem
          the photographs had. */}
      {[
        { x: 52, c: C.coral },
        { x: 84, c: C.plum },
      ].map((k) => (
        <g key={k.x} transform={`translate(${k.x} 118)`}>
          <circle cx="0" cy="-34" r="6.5" fill={k.c} />
          <path d="M0 -27 V-11" stroke={k.c} strokeWidth="6" strokeLinecap="round" />
          <path d="M0 -11 L-5 0 M0 -11 L5 0" stroke={k.c} strokeWidth="4" strokeLinecap="round" />
          <path d="M0 -23 L-8 -17 M0 -23 L8 -18" stroke={k.c} strokeWidth="3.4" strokeLinecap="round" />
        </g>
      ))}

      {/* the ball, arcing between them forever */}
      <g transform="translate(58 96)">
        <g className="pk-art-ball">
          <circle cx="0" cy="0" r="5" fill={C.marigold} />
          <circle cx="-1.5" cy="-1.5" r="1.6" fill={C.cream} opacity=".7" />
        </g>
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* LIFE — the tower at dusk, windows waking one by one under strung lights.   */
/* -------------------------------------------------------------------------- */

// Bulbs are sampled off the same quadratic the wire is drawn with, so they sit
// exactly on it. Precomputed with stable ids rather than mapped by index.
const BULBS = Array.from({ length: 11 }, (_, i) => {
  const t = i / 10;
  const x = (1 - t) ** 2 * -4 + 2 * (1 - t) * t * 100 + t ** 2 * 204;
  const y = (1 - t) ** 2 * 26 + 2 * (1 - t) * t * 62 + t ** 2 * 22;
  return {
    id: `bulb-${x.toFixed(1)}-${y.toFixed(1)}`,
    x,
    y: y + 4,
    delay: `${i * 190}ms`,
    fill: i % 3 === 0 ? C.marigold : i % 3 === 1 ? C.mint : C.coral,
  };
});

function TowerTile() {
  // 5 columns x 6 rows of windows, each on its own delay so the building
  // lights up like an evening rather than a switch being thrown.
  const cols = 5;
  const rows = 6;
  const windows = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      windows.push({ r, c, delay: (r * cols + c) * 260 + ((c * 7) % 5) * 90 });
    }
  }

  return (
    <svg viewBox="0 0 200 210" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true" role="presentation">
      <defs>
        <linearGradient id="duskSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0E2C3A" />
          <stop offset="55%" stopColor="#16382A" />
          <stop offset="100%" stopColor={C.groundLo} />
        </linearGradient>
      </defs>
      <rect width="200" height="210" fill="url(#duskSky)" />

      <circle cx="164" cy="34" r="12" fill={C.cream} opacity=".82" />
      <circle cx="158" cy="30" r="11" fill="#16382A" opacity=".9" />

      {/* strung festival lights, swaying as one */}
      <g className="pk-art-sway">
        <path d="M-4 26 Q100 62 204 22" stroke={C.line} strokeWidth="1.2" fill="none" />
        {BULBS.map((b) => (
          <circle
            key={b.id}
            className="pk-art-twinkle"
            style={{ "--d": b.delay }}
            cx={b.x}
            cy={b.y}
            r="3"
            fill={b.fill}
          />
        ))}
      </g>

      {/* the tower */}
      <rect x="38" y="62" width="124" height="148" rx="6" fill="#0B241B" stroke={C.line} />
      {windows.map((w) => (
        <rect
          key={`${w.r}-${w.c}`}
          className="pk-art-window"
          style={{ "--d": `${w.delay}ms` }}
          x={52 + w.c * 21}
          y={76 + w.r * 21}
          width="13"
          height="13"
          rx="2.5"
          fill={(w.r + w.c) % 4 === 0 ? C.marigold : C.mint}
          opacity=".1"
        />
      ))}

      {/* doorway glow at the foot of the building */}
      <rect x="88" y="188" width="24" height="22" rx="3" fill={C.marigold} opacity=".5" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* PRODUCT — a complaint walking Open -> Checking -> Resolved.                 */
/* -------------------------------------------------------------------------- */

function TrailTile() {
  const steps = [
    { y: 40, c: C.marigold, w: 74 },
    { y: 80, c: C.amber, w: 92 },
    { y: 120, c: C.mint, w: 60, done: true },
  ];

  return (
    <svg viewBox="0 0 200 162" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true" role="presentation">
      <rect width="200" height="162" fill={C.ground} />

      {/* title skeleton */}
      <rect x="18" y="16" width="88" height="7" rx="3.5" fill={C.cream} opacity=".9" />

      {/* the spine the status walks down */}
      <path d="M28 40 V120" stroke={C.line} strokeWidth="2" />
      <path
        className="pk-art-draw"
        style={{ "--len": 80 }}
        d="M28 40 V120"
        stroke={C.mint}
        strokeWidth="2"
        fill="none"
      />

      {steps.map((s, i) => (
        <g key={s.y} className="pk-art-step" style={{ "--d": `${i * 900}ms` }}>
          <circle cx="28" cy={s.y} r="7.5" fill={C.ground} stroke={s.c} strokeWidth="2.4" />
          {s.done ? (
            <path
              d="M24.5 40.2 l2.6 2.6 L32 37"
              transform={`translate(0 ${s.y - 40})`}
              stroke={s.c}
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <circle cx="28" cy={s.y} r="3" fill={s.c} />
          )}
          <rect x="46" y={s.y - 4} width={s.w} height="8" rx="4" fill={s.c} opacity=".8" />
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* PRODUCT — a poll settling. Numerals only, so it needs no translation.      */
/* -------------------------------------------------------------------------- */

function PollTile() {
  const bars = [
    { y: 74, pct: 68, w: 118, c: C.mint, label: "68" },
    { y: 112, pct: 22, w: 40, c: C.amber, label: "22" },
    { y: 150, pct: 10, w: 20, c: C.plum, label: "10" },
  ];

  return (
    <svg viewBox="0 0 200 196" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true" role="presentation">
      <rect width="200" height="196" fill={C.ground} />

      {/* question skeleton + a ballot glyph so the card reads as a poll */}
      <g transform="translate(18 20)">
        <rect width="10" height="10" rx="2" fill={C.mint} opacity=".9" />
        <rect x="18" y="1" width="92" height="8" rx="4" fill={C.cream} opacity=".9" />
        <rect x="18" y="16" width="58" height="5" rx="2.5" fill={C.dim} />
      </g>

      {bars.map((b, i) => (
        <g key={b.y} transform={`translate(18 ${b.y})`}>
          {/* track */}
          <rect width="146" height="16" rx="8" fill={C.card} stroke={C.line} />
          {/* fill — scales from the left so it reads as counting up */}
          <rect
            className="pk-art-bar"
            style={{ "--d": `${i * 320}ms` }}
            width={b.w}
            height="16"
            rx="8"
            fill={b.c}
            opacity=".92"
          />
          <text
            x="154"
            y="12"
            fontSize="10"
            fontWeight="700"
            fill={b.c}
            fontFamily="inherit"
          >
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

// Column A leads; column B is pushed down so the two never align into a grid.
// Heights are carried over from the photo version — the stagger was the one
// thing about the old collage that was working.
const COL_A = [
  { key: "rangoli", h: 168, dur: "9s", delay: "0ms", Art: RangoliTile },
  { key: "notice", h: 228, dur: "11s", delay: "800ms", Art: NoticeTile },
  { key: "courtyard", h: 156, dur: "10s", delay: "1600ms", Art: CourtyardTile },
];
const COL_B = [
  { key: "tower", h: 210, dur: "12s", delay: "400ms", Art: TowerTile },
  { key: "trail", h: 162, dur: "9.5s", delay: "1200ms", Art: TrailTile },
  { key: "poll", h: 196, dur: "10.5s", delay: "2000ms", Art: PollTile },
];

export function HeroCollage() {
  return (
    // aria-hidden: these scenes are atmosphere, not information. Every fact on
    // this page is in the text; announcing six decorative illustrations would
    // only add noise to a screen reader.
    <div
      aria-hidden="true"
      className="pointer-events-none grid select-none grid-cols-2 gap-3 sm:gap-4"
    >
      <div className="pk-par-a flex flex-col gap-3 sm:gap-4">
        {COL_A.map(({ key, h, dur, delay, Art }) => (
          <Tile key={key} h={h} dur={dur} delay={delay}>
            <Art />
          </Tile>
        ))}
      </div>
      {/* The offset. Nothing else on the page uses an odd translate — it earns
          it by turning a grid into a glimpse. */}
      <div className="pk-par-b flex translate-y-8 flex-col gap-3 sm:translate-y-12 sm:gap-4">
        {COL_B.map(({ key, h, dur, delay, Art }) => (
          <Tile key={key} h={h} dur={dur} delay={delay}>
            <Art />
          </Tile>
        ))}
      </div>
    </div>
  );
}
