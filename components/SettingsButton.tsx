// Three dots in the top-right corner that open the settings menu (SM.01).
// No tooltip. The dots are Lucide's "ellipsis-vertical" (ISC licence).

interface SettingsButtonProps {
  className?: string; // extra classes, e.g. "hover" to show the hover box on the test page
  style?: React.CSSProperties;
  open?: boolean; // the menu is open: the box stays lit
  onClick?: () => void;
}

export default function SettingsButton({ className, style, open, onClick }: SettingsButtonProps) {
  return (
    <button
      className={`settings-button${open ? " open" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      aria-label="Settings"
      aria-expanded={open}
      // Never take focus, so Enter still goes to the trainer, not to this button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </button>
  );
}
