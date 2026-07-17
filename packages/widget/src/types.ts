import type { FeedbackCategory } from "@feedback-sdk/client";

// The event a host can listen for after a successful submit.
export interface FeedbackSubmittedDetail {
  id: string;
}

export type { FeedbackCategory };

// Names of the CSS custom properties the widget exposes for theming.
export const THEME_VARS = [
  "--fw-accent",
  "--fw-surface",
  "--fw-surface-strong",
  "--fw-text",
  "--fw-muted",
  "--fw-border",
  "--fw-radius",
  "--fw-z",
] as const;
