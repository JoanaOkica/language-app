/**
 * Cat's Tongue brand marks.
 *
 * Original artwork matching the brand reference: an outlined ginger tabby,
 * both eyes open, cream muzzle, forehead stripes and pointed cheek fur.
 * The wordmark pairs dark "Cat's" with orange "Tongue".
 *
 * Pure SVG so it stays crisp at any size, needs no network request, and can be
 * rendered to PNG for the Android launcher icon (see scripts/make-icons.cjs).
 */

const INK = "#7A3B12";        // outline
const FUR = "#F79433";
const FUR_DARK = "#E0721B";   // stripes
const CREAM = "#FFF3E2";      // muzzle
const PINK = "#F2A6A0";       // inner ear
const NOSE = "#E8677E";
const EYE = "#2E1D12";

interface MarkProps {
  size?: number;
  className?: string;
}

export function CatMark({ size = 40, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Cat's Tongue"
    >
      <g stroke={INK} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        {/* ---- ears ---- */}
        <path d="M23 41 L25 13 L47 26 Z" fill={FUR} />
        <path d="M77 41 L75 13 L53 26 Z" fill={FUR} />
        <path d="M29 35 L30 22 L40 28 Z" fill={PINK} strokeWidth="0" />
        <path d="M71 35 L70 22 L60 28 Z" fill={PINK} strokeWidth="0" />

        {/* ---- head, with pointed cheek fur down each side ---- */}
        <path
          d="M50 24
             C 68 24, 81 36, 81 50
             L 89 54 L 80 59 L 87 65
             C 82 77, 68 85, 50 85
             C 32 85, 18 77, 13 65
             L 20 59 L 11 54 L 19 50
             C 19 36, 32 24, 50 24 Z"
          fill={FUR}
        />

        {/* ---- cream muzzle + chin ---- */}
        <ellipse cx="50" cy="66" rx="19" ry="13" fill={CREAM} strokeWidth="0" />
      </g>

      {/* ---- tabby stripes ---- */}
      <g stroke={FUR_DARK} strokeWidth="3.4" strokeLinecap="round" fill="none">
        <path d="M41 33 v9" />
        <path d="M50 31 v10" />
        <path d="M59 33 v9" />
      </g>

      {/* ---- eyes ---- */}
      <ellipse cx="38" cy="53" rx="5.4" ry="6.2" fill={EYE} />
      <ellipse cx="62" cy="53" rx="5.4" ry="6.2" fill={EYE} />
      <circle cx="39.8" cy="50.8" r="1.9" fill="#fff" />
      <circle cx="63.8" cy="50.8" r="1.9" fill="#fff" />

      {/* ---- nose + smile ---- */}
      <path d="M46 61 L54 61 L50 65.5 Z" fill={NOSE} />
      <g stroke={INK} strokeWidth="2.3" fill="none" strokeLinecap="round">
        <path d="M50 65.5 q-4.5 4.5 -8 1.5" />
        <path d="M50 65.5 q4.5 4.5 8 1.5" />
      </g>

      {/* ---- whiskers ---- */}
      <g stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.75">
        <path d="M28 62 L14 60" />
        <path d="M28 67 L15 70" />
        <path d="M72 62 L86 60" />
        <path d="M72 67 L85 70" />
      </g>
    </svg>
  );
}

/** "Cat's Tongue" in the brand's two colours. */
export function CatWordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <span className="wm-cats">Cat's</span>{" "}
      <span className="wm-tongue">Tongue</span>
    </span>
  );
}

/** Mark above the wordmark — used on the welcome and auth screens. */
export function CatLockup({ markSize = 88, wordSize = 30 }: {
  markSize?: number;
  wordSize?: number;
}) {
  return (
    <div className="lockup">
      <CatMark size={markSize} />
      <CatWordmark size={wordSize} />
    </div>
  );
}
