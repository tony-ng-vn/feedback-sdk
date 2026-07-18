export type FeedbackCategory = "idea" | "bug" | "other";

export interface SubmitFeedbackOptions {
  endpoint: string;
  token: string;
  message: string;
  category?: FeedbackCategory;
  pageContext?: string;
  metadata?: Record<string, unknown>;
  submitter?: string;
  // Optional screenshot as a base64 image data URL (e.g. "data:image/png;base64,...").
  screenshot?: string;
  // Injectable for tests; defaults to the global fetch.
  fetchImpl?: typeof fetch;
}

export async function submitFeedback(
  options: SubmitFeedbackOptions,
): Promise<{ id: string }> {
  const doFetch = options.fetchImpl ?? fetch;

  // Only send the fields the caller set, so the server applies its defaults.
  const body: Record<string, unknown> = { message: options.message };
  if (options.category !== undefined) body.category = options.category;
  if (options.pageContext !== undefined) body.pageContext = options.pageContext;
  if (options.metadata !== undefined) body.metadata = options.metadata;
  if (options.submitter !== undefined) body.submitter = options.submitter;
  if (options.screenshot !== undefined) body.screenshot = options.screenshot;

  const response = await doFetch(`${options.endpoint}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Feedback submit failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // keep the status-code fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as { id: string };
}
