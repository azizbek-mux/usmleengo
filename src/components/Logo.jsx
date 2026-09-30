/**
 * usmleengo mark: a thin ring with the wordmark laid across it.
 *
 * The wordmark is drawn twice — once as a fat stroke in the page background
 * colour, then filled — so it knocks a clean gap out of the ring where the two
 * overlap, instead of the letters sitting on top of a visible line.
 * `paint-order` is what puts that halo underneath the fill.
 *
 * The last letter, the o, wears a doppi, the Uzbek skullcap, so that it reads
 * as a head: the cap is a mint dome with the embroidered almond (bodom) and
 * the band cut out of it, and it has the same halo, which leaves a thin seam
 * between the cap and the letter. The wordmark is anchored at its end, not its
 * middle, so that the o - and the cap on it - is in the same place whatever
 * font the phone draws the letters in. The view box has a margin of 6 so that
 * neither end of the wordmark is clipped. public/logo.svg is the same drawing.
 */
export default function Logo({ size = 96, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="-6 -6 272 272"
      role="img"
      aria-label="usmleengo"
    >
      <circle
        cx="130"
        cy="130"
        r="92"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
      />
      <text
        x="261.6"
        y="131"
        textAnchor="end"
        dominantBaseline="central"
        fontFamily='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif'
        fontSize="52"
        fontWeight="800"
        letterSpacing="-1.5"
        stroke="var(--bg)"
        strokeWidth="16"
        paintOrder="stroke"
        fill="currentColor"
      >
        usmleengo
      </text>
      <g transform="translate(246.8 127.2) scale(0.97)">
        <path
          d="M-16 0 C-16.8 -7.4 -13.2 -14.8 -6.6 -16.8 Q0 -18.6 6.6 -16.8 C13.2 -14.8 16.8 -7.4 16 0 Z"
          fill="currentColor"
          stroke="var(--bg)"
          strokeWidth="2.6"
          strokeLinejoin="round"
          paintOrder="stroke"
        />
        <path d="M-15 -3.9 H15" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" />
        <path
          transform="translate(0 -6.8) scale(1.35 1.5)"
          d="M0 -6.4 C4 -3.6 4.2 -0.4 0 1 C-4.2 -0.4 -4 -3.6 0 -6.4 Z"
          fill="var(--bg)"
        />
      </g>
    </svg>
  );
}
