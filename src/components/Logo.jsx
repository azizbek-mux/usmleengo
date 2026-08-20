/**
 * usmleengo mark: a thin ring with the wordmark laid across it.
 *
 * The wordmark is drawn twice — once as a fat stroke in the page background
 * colour, then filled — so it knocks a clean gap out of the ring where the two
 * overlap, instead of the letters sitting on top of a visible line.
 * `paint-order` is what puts that halo underneath the fill.
 */
export default function Logo({ size = 96, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 260 260"
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
        x="130"
        y="131"
        textAnchor="middle"
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
    </svg>
  );
}
