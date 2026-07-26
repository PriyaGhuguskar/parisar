// The auth panel's signature: one wing's facade at dusk, windows lighting one
// by one.
//
// WHAT THIS REPLACED AND WHY: a wide skyline of five near-identical towers with
// full window grids. It was simultaneously busy and flat — the uniform grids
// read as noise, and nothing in it was specific to this product. A society is
// not a skyline; from the inside it is ONE building you know, and a grid of
// flats where some lights are on.
//
// So the drawing is a single facade, cropped left/right/bottom so it continues
// past the frame, with most windows dark and a handful lit. The lit ones come on
// in sequence on load, which is the one orchestrated moment on the screen and
// which earns the panel's headline literally: "Every society has a rhythm.
// Parisar keeps it." The rhythm is the lighting.
//
// Restraint: no trees, no moon, no stars, no gate, no footpath. All of that was
// decoration competing with the one idea. Everything left is the building.

const COLS = 6;
const ROWS = 9;

// Which windows are lit, and in what order they come on. Deliberately scattered
// and slightly clustered — a real building lights up unevenly, and an even
// spread would read as a pattern rather than as people being home.
const LAMPS = [
  [1, 1],
  [4, 0],
  [0, 3],
  [3, 2],
  [5, 4],
  [2, 5],
  [4, 6],
  [1, 7],
  [3, 8],
];

const X0 = 96; // facade left edge (bleeds past the viewBox on both sides)
const W = 428; // facade width
const Y0 = 128; // top of the topmost window row
const COL_W = 62;
const ROW_H = 74;
const WIN_W = 40;
const WIN_H = 34;

export default function SocietyScene({ className = "" }) {
  const lampIndex = new Map(LAMPS.map(([c, r], i) => [`${c}-${r}`, i]));
  const windows = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = X0 + 22 + c * COL_W;
      const y = Y0 + r * ROW_H;
      const lit = lampIndex.get(`${c}-${r}`);
      windows.push(
        <rect
          key={`w-${c}-${r}`}
          x={x}
          y={y}
          width={WIN_W}
          height={WIN_H}
          rx={4}
          fill={lit === undefined ? "#1B4636" : "#F0B45E"}
          className={lit === undefined ? undefined : "pk-lamp"}
          style={lit === undefined ? undefined : { animationDelay: `${420 + lit * 190}ms` }}
        />,
      );
      // Balcony rail under each window — the texture that makes it read as
      // Indian housing rather than as an office block.
      windows.push(
        <rect
          key={`b-${c}-${r}`}
          x={x - 5}
          y={y + WIN_H + 5}
          width={WIN_W + 10}
          height={5}
          rx={2.5}
          fill="#0E2E23"
        />,
      );
    }
  }

  return (
    <svg
      viewBox="0 0 620 820"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      role="img"
      aria-label="Illustration of a housing society wing at dusk, with windows lit"
    >
      <defs>
        <linearGradient id="pk-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#081812" />
          <stop offset="70%" stopColor="#0B2018" />
          <stop offset="100%" stopColor="#0D2A20" />
        </linearGradient>
        <linearGradient id="pk-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#15402F" />
          <stop offset="100%" stopColor="#102E23" />
        </linearGradient>
        {/* Warm bloom behind the facade — the only soft light in the frame. */}
        <radialGradient id="pk-bloom" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F0B45E" stopOpacity=".16" />
          <stop offset="100%" stopColor="#F0B45E" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="620" height="820" fill="url(#pk-dusk)" />
      <ellipse cx="310" cy="470" rx="330" ry="300" fill="url(#pk-bloom)" />

      {/* The facade. Cropped top and bottom so it continues past the frame —
          you are standing at its foot, not looking at a model of it. */}
      <rect x={X0} y={72} width={W} height={760} rx={10} fill="url(#pk-face)" />
      {/* Vertical service columns break the grid so it is not a spreadsheet. */}
      <rect x={X0 + 196} y={72} width={14} height={760} fill="#0E2E23" opacity=".85" />
      <rect x={X0 + 386} y={72} width={10} height={760} fill="#0E2E23" opacity=".7" />
      {/* Parapet */}
      <rect x={X0 - 10} y={58} width={W + 20} height={18} rx={6} fill="#0E2E23" />

      {windows}
    </svg>
  );
}
