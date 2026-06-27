// Vibrant per-column accent palette, keyed by column id. Decoupled from the DB
// `color` field so theming lives in the frontend. Falls back to the API color
// (or a neutral) for any unknown/custom column id.

export interface ColumnAccent {
  /** Solid accent used for the header bar, count chip, and glow. */
  color: string;
  /** rgba glow used in shadows on hover/active. */
  glow: string;
}

const ACCENTS: Record<string, ColumnAccent> = {
  backlog: { color: "#94a3b8", glow: "rgba(148,163,184,0.45)" },
  "in-progress": { color: "#22d3ee", glow: "rgba(34,211,238,0.55)" },
  review: { color: "#fbbf24", glow: "rgba(251,191,36,0.55)" },
  done: { color: "#34d399", glow: "rgba(52,211,153,0.55)" },
  blocked: { color: "#fb7185", glow: "rgba(251,113,133,0.55)" },
};

export function columnAccent(id: string, fallback?: string): ColumnAccent {
  return (
    ACCENTS[id] ?? {
      color: fallback ?? "#a5b4cf",
      glow: "rgba(165,180,207,0.45)",
    }
  );
}
