// Three dots in the top-right corner that will open the settings menu (SM.01).
// No tooltip. The dots are Lucide's "ellipsis-vertical" (ISC licence).

interface SettingsButtonProps {
  className?: string; // extra classes, e.g. "hover" to show the hover box on the test page
  style?: React.CSSProperties;
}

export default function SettingsButton({ className, style }: SettingsButtonProps) {
  return (
    <button className={`settings-button${className ? ` ${className}` : ""}`} style={style} aria-label="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </button>
  );
}
