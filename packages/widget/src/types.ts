// The default categories the widget offers. Defined here (rather than imported
// from @feedback-sdk/client) so the published widget's types are self-contained:
// the client package is a build-time dependency, not published to npm.
export type FeedbackCategory = "idea" | "bug" | "other";

// The event a host can listen for after a successful submit.
export interface FeedbackSubmittedDetail {
  id: string;
}

// Names of the CSS custom properties the widget exposes for theming.
export const THEME_VARS = [
  "--fw-accent",
  "--fw-accent-ink",
  "--fw-surface",
  "--fw-surface-strong",
  "--fw-text",
  "--fw-muted",
  "--fw-border",
  "--fw-radius",
  "--fw-z",
] as const;
