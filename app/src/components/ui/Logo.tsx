/**
 * The IELTS Prep mark, as a component.
 *
 * Inlined rather than an <img> so it needs no network or asset resolution: the sidebar drew
 * its own shape by hand before, which meant the app's mark and its icon were two drawings
 * that could drift apart. There is one geometry per size band now, and each file says which
 * band it is for.
 *
 * **This is the compact drawing — the capped I alone.** The full lockup, a capital I in a
 * mortarboard followed by ELTS, lives in `docs/brand/logo.svg` and is used where there is
 * room for it: the README, the app icon at 128px and above. Its ELTS strokes are 2.2 units
 * on a 64-unit grid, so at the 32px this component renders at they land under a pixel and
 * turn to grey mush. `app/public/favicon.svg` is this same drawing, and
 * `app/public/favicon-small.svg` drops the tassel for 16px, where the ball lands on the
 * board's own edge and reads as a nick in it.
 *
 * **The colours are fixed, not tokens.** They were `primary` and `primary-foreground` for one
 * commit, which inverted the mark in dark mode: `--primary-foreground` is `240 10% 6%` there,
 * so the mark turned near-black on teal. That pairing is right for a button, whose label must
 * contrast with whatever the theme makes of the primary, and wrong for a logo, which is one
 * fixed thing. These two values are the same ones in every icon file, so the sidebar, the
 * browser tab and the dock all show the identical mark.
 */

/** The mark's own teal and white. Do not swap these for theme tokens. */
const TEAL = "#158475";
const INK = "#ffffff";

export function Logo({ className, title = "IELTS Prep" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <rect width="64" height="64" rx="10" fill={TEAL} />
      <g fill={INK}>
        {/* the board */}
        <path d="M32 11 L55 19 L32 27 L9 19 Z" />
        {/* the tassel, hung from the board's right tip */}
        <path
          d="M53 20.4 V27.5"
          stroke={INK}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="53" cy="30" r="2.6" />
        {/* the I: serifed, so it reads as a letter rather than a bar */}
        <path d="M17 30.5 H47 V37 H36.5 V48 H47 V54.5 H17 V48 H27.5 V37 H17 Z" />
      </g>
    </svg>
  );
}
