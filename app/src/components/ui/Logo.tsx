/**
 * The BandReady mark, as a component.
 *
 * Inlined rather than an <img> so it inherits currentColor nowhere and needs no network or
 * asset resolution: the sidebar drew this shape by hand before, as a lucide GraduationCap in
 * a tinted square, which meant the app's own mark and its icon were two different drawings
 * that could drift apart. There is one drawing now, and `app/public/favicon.svg` is the same
 * geometry.
 *
 * Below about 20px the counters close up, so anything smaller should use the flat 16px
 * drawing instead of shrinking this one.
 *
 * **The colours are fixed, not tokens.** They were `primary` and `primary-foreground` for one
 * commit, which inverted the mark in dark mode: `--primary-foreground` is `240 10% 6%` there,
 * so the B turned near-black on teal. That pairing is right for a button, whose label must
 * contrast with whatever the theme makes of the primary, and wrong for a logo, which is one
 * fixed thing. These two values are the same ones in `favicon.svg` and in the packaged app
 * icon, so the sidebar, the browser tab and the dock all show the identical mark.
 */

/** The mark's own teal and white. Do not swap these for theme tokens. */
const TEAL = "#158475";
const INK = "#ffffff";
export function Logo({ className, title = "BandReady" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <rect width="64" height="64" rx="10" fill={TEAL} />
      <g fill={INK}>
        <path d="M32 11 L51 17 L32 23 L13 17 Z" />
        <path
          d="M49.8 17.6 V24.4"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="49.8" cy="26.6" r="2.3" />
        <path
          fillRule="evenodd"
          d="M18.5 24.8 H34 C39.6 24.8 42.8 27.8 42.8 31.9 C42.8 35 41.2 36.8 38.8 37.7
             C41.8 38.5 44.1 40.7 44.1 44.3 C44.1 49 40.4 52.2 34.7 52.2 H18.5 Z
             M25.8 30.4 H33.3 C35.1 30.4 36.2 31.4 36.2 32.8 C36.2 34.2 35.1 35.2 33.3 35.2 H25.8 Z
             M25.8 41.9 H34.2 C36.2 41.9 37.4 43 37.4 44.6 C37.4 46.3 36.2 47.4 34.2 47.4 H25.8 Z"
        />
      </g>
    </svg>
  );
}
