export default function Logo({ size = 28 }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-lg bg-accent text-accent-ink" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 25 16 6l9 19M11 18.5h10" />
      </svg>
    </span>
  );
}
