import { Segmented } from "./Segmented";
import styles from "./VisualToggle.module.css";

export type VisualMode = "Chart" | "Grid";

const MODES: readonly VisualMode[] = ["Chart", "Grid"];

function ModeIcon({ mode }: { mode: VisualMode }) {
  if (mode === "Chart") {
    return (
      <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 15.5 7.2 10l3.2 2.6L17 4.5" />
      </svg>
    );
  }
  return (
    <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" />
      <rect x="11" y="3" width="6" height="6" />
      <rect x="3" y="11" width="6" height="6" />
      <rect x="11" y="11" width="6" height="6" />
    </svg>
  );
}

export function VisualToggle({
  value,
  onChange,
  label,
  gridLabel = "Composition grid",
}: {
  value: VisualMode;
  onChange: (value: VisualMode) => void;
  label: string;
  gridLabel?: string;
}) {
  return (
    <div className={styles.root}>
      <Segmented
        options={MODES}
        value={value}
        onChange={onChange}
        label={label}
        optionLabel={(mode) => (mode === "Chart" ? "Chart" : gridLabel)}
        format={(mode) => <ModeIcon mode={mode} />}
      />
    </div>
  );
}
