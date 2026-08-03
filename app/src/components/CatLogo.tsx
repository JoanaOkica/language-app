/**
 * Cat's Tongue brand marks.
 *
 * Original artwork drawn to match the brand reference: a cheeky orange tabby,
 * one eye winking, tongue out, carrying a little chat-bubble flag. The wordmark
 * pairs blue "Cat's" with orange "Tongue".
 *
 * Pure SVG so it stays crisp at any size, themes with CSS variables, needs no
 * network request, and can be rendered to PNG for the Android launcher icon.
 */

interface MarkProps {
  size?: number;
  /** Show the little flag the cat holds. Off for small/tight placements. */
  flag?: boolean;
  className?: string;
}

export function CatMark({ size = 40, flag = false, className }: MarkProps) {
  // With the flag the canvas widens so the banner sits beside the cat rather
  // than across its face; without it the mark stays square for favicons/icons.
  const viewBox = flag ? "0 0 140 100" : "0 0 100 100";
  return (
    <svg
      width={flag ? size * 1.4 : size}
      height={size}
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label="Cat's Tongue"
    >
      {/* ---- ears ---- */}
      <path d="M20 40 L24 13 L45 27 Z" fill="#F0862A" />
      <path d="M80 40 L76 13 L55 27 Z" fill="#F0862A" />
      <path d="M25 36 L27 21 L38 29 Z" fill="#F7A9B8" />
      <path d="M75 36 L73 21 L62 29 Z" fill="#F7A9B8" />

      {/* ---- head ---- */}
      <ellipse cx="50" cy="57" rx="34" ry="29" fill="#F79433" />
      {/* muzzle / chin, a shade lighter */}
      <ellipse cx="50" cy="68" rx="21" ry="14" fill="#FDBE74" />

      {/* ---- tabby stripes ---- */}
      <path d="M42 31 q3 6 0 11" stroke="#E0721B" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M50 29 q3 7 0 13" stroke="#E0721B" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M58 31 q3 6 0 11" stroke="#E0721B" strokeWidth="3.2" fill="none" strokeLinecap="round" />

      {/* ---- eyes: left open, right winking ---- */}
      <ellipse cx="38" cy="54" rx="4.6" ry="5.6" fill="#3B2A20" />
      <circle cx="39.6" cy="52" r="1.7" fill="#fff" />
      <path d="M56.5 55 q5.5 -6.5 11 0" stroke="#3B2A20" strokeWidth="3.2"
            fill="none" strokeLinecap="round" />

      {/* ---- blush ---- */}
      <ellipse cx="29" cy="64" rx="6" ry="4" fill="#F7A9B8" opacity="0.55" />
      <ellipse cx="71" cy="64" rx="6" ry="4" fill="#F7A9B8" opacity="0.55" />

      {/* ---- nose + mouth ---- */}
      <path d="M46.5 62 L53.5 62 L50 66 Z" fill="#E8677E" />
      <path d="M50 66 q-4.5 5 -9 1" stroke="#3B2A20" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M50 66 q4.5 5 9 1" stroke="#3B2A20" strokeWidth="2.4" fill="none" strokeLinecap="round" />

      {/* ---- tongue ---- */}
      <path d="M44 71 q6 12 12 0 Z" fill="#F0637E" />
      <path d="M50 72 v5" stroke="#D94A66" strokeWidth="1.6" strokeLinecap="round" />

      {/* ---- whiskers ---- */}
      <g stroke="#E0721B" strokeWidth="2" strokeLinecap="round">
        <path d="M22 60 L8 56" />
        <path d="M22 65 L7 66" />
        <path d="M78 60 L92 56" />
        <path d="M78 65 L93 66" />
      </g>

      {/* ---- chat-bubble flag, clear of the whiskers (which reach x≈93) ---- */}
      {flag && (
        <g>
          <path d="M104 88 V26" stroke="#C9762F" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="104" cy="24" r="3" fill="#C9762F" />
          <rect x="104" y="30" width="32" height="23" rx="6" fill="#2D62D8" />
          <path d="M110 53 l0 7 l7 -7 Z" fill="#2D62D8" />
          <circle cx="113" cy="41.5" r="2.6" fill="#fff" />
          <circle cx="120" cy="41.5" r="2.6" fill="#fff" />
          <circle cx="127" cy="41.5" r="2.6" fill="#fff" />
        </g>
      )}
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

/** Full lockup: mark, wordmark and tagline — used on the sign-in screen. */
export function CatLockup() {
  return (
    <div className="lockup">
      <CatMark size={96} flag />
      <CatWordmark size={30} />
      <p className="tagline">Speak Clearly, Connect Globally</p>
    </div>
  );
}
