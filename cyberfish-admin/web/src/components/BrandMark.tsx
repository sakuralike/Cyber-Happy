export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M2 12c3.7-5.1 9.7-6.6 15.2-3.1L21 5.5v13l-3.8-3.4C11.7 18.6 5.7 17.1 2 12Z" />
      <circle cx="8.2" cy="10.2" r="1.15" fill="var(--canvas, #fff)" />
      <path fill="currentColor" d="M4.2 12h4.3v1.4H4.2z" opacity=".65" />
    </svg>
  );
}
