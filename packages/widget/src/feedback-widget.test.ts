// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const submitMock = vi.fn();
vi.mock("@feedback-sdk/client", () => ({
  submitFeedback: (...args: unknown[]) => submitMock(...args),
}));

// Import for the self-registering side effect after the mock is set up.
await import("./feedback-widget");

function mount(attrs: Record<string, string>) {
  const el = document.createElement("feedback-widget");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

function shadow(el: Element) {
  const root = (el as HTMLElement).shadowRoot;
  if (!root) throw new Error("no shadow root");
  return root;
}

beforeEach(() => {
  submitMock.mockReset();
  document.body.innerHTML = "";
});
afterEach(() => {
  document.body.innerHTML = "";
});

test("registers the custom element", () => {
  expect(customElements.get("feedback-widget")).toBeTruthy();
});

test("renders a trigger button with the default label", () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  const trigger = shadow(el).querySelector(".fw-fab");
  expect(trigger?.textContent).toContain("Feedback");
});

test("opening shows category chips from the categories attribute", () => {
  const el = mount({
    endpoint: "https://x.site",
    token: "fbk_x_1",
    categories: "idea,bug",
  });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const chips = [...shadow(el).querySelectorAll(".fw-chip")].map(
    (c) => c.textContent?.trim(),
  );
  expect(chips).toEqual(["idea", "bug"]);
});

test("submitting calls submitFeedback with endpoint, token, message, page context", async () => {
  submitMock.mockResolvedValue({ id: "fb_1" });
  const el = mount({
    endpoint: "https://x.site",
    token: "fbk_x_1",
    "page-context": "/dash",
  });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const textarea = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  textarea.value = "it broke";
  textarea.dispatchEvent(new Event("input"));
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  await vi.waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));

  const arg = submitMock.mock.calls[0][0];
  expect(arg.endpoint).toBe("https://x.site");
  expect(arg.token).toBe("fbk_x_1");
  expect(arg.message).toBe("it broke");
  expect(arg.pageContext).toBe("/dash");
});

test("a successful submit dispatches feedback-submitted with the id", async () => {
  submitMock.mockResolvedValue({ id: "fb_42" });
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  const seen: string[] = [];
  el.addEventListener("feedback-submitted", (e) =>
    seen.push((e as CustomEvent<{ id: string }>).detail.id),
  );
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const textarea = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  textarea.value = "nice";
  textarea.dispatchEvent(new Event("input"));
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  await vi.waitFor(() => expect(seen).toEqual(["fb_42"]));
});

test("a failed submit shows the error message and does not throw", async () => {
  submitMock.mockRejectedValue(new Error("Unauthorized"));
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const textarea = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  textarea.value = "x";
  textarea.dispatchEvent(new Event("input"));
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  await vi.waitFor(() =>
    expect(shadow(el).querySelector(".fw-error")?.textContent).toContain(
      "Unauthorized",
    ),
  );
});

test("attaching an image includes its data url in the submitted feedback", async () => {
  submitMock.mockResolvedValue({ id: "fb_img" });
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const textarea = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  textarea.value = "with a shot";
  textarea.dispatchEvent(new Event("input"));

  const fileInput = shadow(el).querySelector(".fw-file") as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3, 4])], "shot.png", {
    type: "image/png",
  });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fileInput.dispatchEvent(new Event("change"));

  // The preview appears once the file is read as a data url.
  await vi.waitFor(() =>
    expect(shadow(el).querySelector(".fw-preview")).toBeTruthy(),
  );

  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  await vi.waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
  const arg = submitMock.mock.calls[0][0];
  expect(typeof arg.screenshot).toBe("string");
  expect(arg.screenshot.startsWith("data:image/png")).toBe(true);
});

test("an oversized image is rejected client-side and not attached", async () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();

  const fileInput = shadow(el).querySelector(".fw-file") as HTMLInputElement;
  const big = new File([new Uint8Array(3_000_001)], "big.png", {
    type: "image/png",
  });
  Object.defineProperty(fileInput, "files", { value: [big], configurable: true });
  fileInput.dispatchEvent(new Event("change"));

  await vi.waitFor(() =>
    expect(shadow(el).querySelector(".fw-error")?.textContent).toContain(
      "too large",
    ),
  );
  expect(shadow(el).querySelector(".fw-preview")).toBeNull();
});

test("submit is a no-op when the message is empty", () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  expect(submitMock).not.toHaveBeenCalled();
});

test("embed: everything renders inside the shadow root, nothing leaks to the page", () => {
  const headStylesBefore = document.head.querySelectorAll("style").length;
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  // The host app's document must stay untouched: no widget nodes outside the
  // shadow root and no styles injected into the page head.
  expect(document.querySelector(".fw-panel")).toBeNull();
  expect(document.querySelector(".fw-fab")).toBeNull();
  expect(document.head.querySelectorAll("style").length).toBe(headStylesBefore);
});

test("embed: the module leaves no widget globals on window", () => {
  const w = window as unknown as Record<string, unknown>;
  expect(w.FeedbackWidget).toBeUndefined();
  expect(w.feedbackWidget).toBeUndefined();
});

function hostVar(el: Element, name: string): string {
  return getComputedStyle(el as HTMLElement).getPropertyValue(name).trim().toLowerCase();
}

test("theme: defaults to the light palette when no theme is set", () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  expect(hostVar(el, "--fw-surface")).toBe("#ffffff");
  expect(hostVar(el, "--fw-text")).toBe("#111111");
});

test('theme="dark" switches the widget to a dark palette', () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1", theme: "dark" });
  // Dark surface, light text -- the whole point.
  expect(hostVar(el, "--fw-surface")).toBe("#16161a");
  expect(hostVar(el, "--fw-text")).toBe("#f4f4f6");
});

test('theme="light" is explicit light and matches the default', () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1", theme: "light" });
  expect(hostVar(el, "--fw-surface")).toBe("#ffffff");
});

test('theme="auto" ships a prefers-color-scheme dark rule', () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1", theme: "auto" });
  const style = shadow(el).querySelector("style")?.textContent ?? "";
  expect(style).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  expect(style).toContain(':host([theme="auto"])');
});

test("an app's own CSS variable override still wins over the built-in dark theme", () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1", theme: "dark" });
  (el as HTMLElement).style.setProperty("--fw-surface", "#abcdef");
  expect(hostVar(el, "--fw-surface")).toBe("#abcdef");
});

test("form controls inherit the widget font instead of browser defaults", () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const hostFont = getComputedStyle(el as HTMLElement).fontFamily;
  // Guard against a vacuous pass if computed styles come back empty.
  expect(hostFont).toContain("system-ui");
  // Browsers give textareas a monospace default; the widget must override it
  // or the panel is typeset in two clashing fonts. happy-dom reports the
  // literal "inherit" rather than resolving it, so accept either form -- what
  // this guards is the reset reaching the control at all.
  const input = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  expect(["inherit", hostFont]).toContain(getComputedStyle(input).fontFamily);
});

test("markup in a server error message is escaped, not injected", async () => {
  submitMock.mockRejectedValue(new Error("<img src=x onerror=window.__xss=1>"));
  (window as unknown as { __xss?: number }).__xss = undefined;
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const textarea = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  textarea.value = "x";
  textarea.dispatchEvent(new Event("input"));
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();

  const errorEl = await vi.waitFor(() => {
    const node = shadow(el).querySelector(".fw-error");
    if (!node) throw new Error("no error node yet");
    return node;
  });
  // The raw markup shows as text; no <img> element was created and no handler ran.
  expect(errorEl.querySelector("img")).toBeNull();
  expect(errorEl.textContent).toContain("<img src=x onerror=window.__xss=1>");
  expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
});
