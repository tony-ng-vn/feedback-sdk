import { submitFeedback } from "@feedback-sdk/client";
import type { FeedbackSubmittedDetail } from "./types";

type State = "idle" | "sending" | "sent" | "error";

const STYLE = `
  :host {
    --fw-accent: #4f46e5;
    --fw-surface: #ffffff;
    --fw-surface-strong: #f5f5f7;
    --fw-text: #111111;
    --fw-muted: #6b7280;
    --fw-border: rgba(0, 0, 0, 0.12);
    --fw-radius: 16px;
    --fw-z: 2147483000;
    position: fixed;
    right: 22px;
    bottom: 20px;
    z-index: var(--fw-z);
    font-family: system-ui, -apple-system, sans-serif;
  }
  .fw-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .fw-fab {
    min-height: 34px; padding: 7px 15px;
    border: 1px solid var(--fw-border); border-radius: 999px;
    background: var(--fw-surface-strong); color: var(--fw-text);
    font-size: 13px; font-weight: 500; cursor: pointer;
  }
  .fw-panel {
    width: min(300px, 78vw); display: flex; flex-direction: column; gap: 10px;
    padding: 14px; border: 1px solid var(--fw-border);
    border-radius: var(--fw-radius); background: var(--fw-surface);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  }
  .fw-head { display: flex; justify-content: space-between; align-items: center;
    color: var(--fw-text); font-size: 13px; font-weight: 600; }
  .fw-close { border: 0; background: transparent; color: var(--fw-muted);
    font-size: 18px; line-height: 1; cursor: pointer; }
  .fw-chips { display: flex; gap: 6px; }
  .fw-chip { flex: 1; min-height: 30px; border: 1px solid var(--fw-border);
    border-radius: 999px; background: transparent; color: var(--fw-text);
    font-size: 12px; cursor: pointer; text-transform: capitalize; }
  .fw-chip[aria-pressed="true"] { background: var(--fw-surface-strong);
    border-color: var(--fw-accent); }
  .fw-input { width: 100%; box-sizing: border-box; resize: vertical; padding: 10px;
    border: 1px solid var(--fw-border); border-radius: 12px;
    background: var(--fw-surface-strong); color: var(--fw-text); font-size: 13px; }
  .fw-error { margin: 0; color: #d64545; font-size: 12px; }
  .fw-submit { min-height: 34px; border: 0; border-radius: 999px;
    background: var(--fw-accent); color: #fff; font-size: 13px; font-weight: 600;
    cursor: pointer; }
  .fw-submit:disabled { opacity: 0.55; cursor: default; }
  .fw-attach { display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--fw-muted); cursor: pointer; width: fit-content;
    border: 1px dashed var(--fw-border); border-radius: 8px; padding: 6px 10px; }
  .fw-attach:hover { color: var(--fw-text); border-color: var(--fw-accent); }
  .fw-preview { position: relative; width: fit-content; }
  .fw-thumb { display: block; max-height: 92px; max-width: 100%;
    border-radius: 8px; border: 1px solid var(--fw-border); }
  .fw-remove { position: absolute; top: -8px; right: -8px; width: 20px; height: 20px;
    border-radius: 50%; border: 0; background: var(--fw-text); color: var(--fw-surface);
    font-size: 12px; line-height: 1; cursor: pointer; }
  [hidden] { display: none !important; }
`;

// Escape dynamic values before templating into innerHTML. Attribute values,
// the typed message, and server error text are all untrusted from the widget's
// point of view, so they must never be interpolated raw.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class FeedbackWidget extends HTMLElement {
  private root: ShadowRoot;
  private open = false;
  private state: State = "idle";
  private category = "";
  private message = "";
  private errorMessage = "";
  // Optional attached screenshot as a base64 image data URL.
  private screenshot: string | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    if (this.category === "") this.category = this.categories[0] ?? "idea";
    this.render();
  }

  private get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }
  private get token(): string {
    return this.getAttribute("token") ?? "";
  }
  private get label(): string {
    return this.getAttribute("label") ?? "Feedback";
  }
  private get categories(): string[] {
    const raw = this.getAttribute("categories");
    if (raw === null) return ["idea", "bug", "other"];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  private get pageContext(): string {
    const attr = this.getAttribute("page-context");
    if (attr !== null) return attr;
    return typeof location !== "undefined"
      ? location.pathname + location.search
      : "";
  }
  private get submitter(): string | undefined {
    return this.getAttribute("submitter") ?? undefined;
  }

  private toggle = (): void => {
    this.open = !this.open;
    if (this.open) {
      this.state = "idle";
      this.errorMessage = "";
    }
    this.render();
  };

  private pick(category: string): void {
    this.category = category;
    this.render();
  }

  private readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private async doSubmit(): Promise<void> {
    const trimmed = this.message.trim();
    if (trimmed === "" || this.state === "sending") return;
    this.state = "sending";
    this.errorMessage = "";
    this.render();
    try {
      const result = await submitFeedback({
        endpoint: this.endpoint,
        token: this.token,
        message: trimmed,
        category: this.category as never,
        pageContext: this.pageContext,
        submitter: this.submitter,
        screenshot: this.screenshot ?? undefined,
      });
      this.state = "sent";
      this.message = "";
      this.screenshot = null;
      const detail: FeedbackSubmittedDetail = { id: result.id };
      this.dispatchEvent(
        new CustomEvent("feedback-submitted", {
          detail,
          bubbles: true,
          composed: true,
        }),
      );
      this.render();
      setTimeout(() => {
        this.state = "idle";
        this.open = false;
        this.render();
      }, 1200);
    } catch (error) {
      this.state = "error";
      this.errorMessage =
        error instanceof Error ? error.message : "Could not send feedback.";
      this.render();
    }
  }

  private render(): void {
    const sending = this.state === "sending";
    const sent = this.state === "sent";
    const submitLabel = sending ? "Sending..." : sent ? "Thanks!" : "Submit";
    const chips = this.categories
      .map(
        (c) =>
          `<button class="fw-chip" data-cat="${escapeHtml(c)}" aria-pressed="${c === this.category}">${escapeHtml(c)}</button>`,
      )
      .join("");

    this.root.innerHTML = `
      <style>${STYLE}</style>
      <div class="fw-wrap">
        <div class="fw-panel" ${this.open ? "" : "hidden"} role="dialog" aria-label="Send feedback">
          <div class="fw-head">
            <span>Share an idea</span>
            <button class="fw-close" aria-label="Close">x</button>
          </div>
          <div class="fw-chips">${chips}</div>
          <textarea class="fw-input" rows="4" placeholder="What's on your mind?" ${sending || sent ? "disabled" : ""}>${escapeHtml(this.message)}</textarea>
          ${
            this.screenshot
              ? `<div class="fw-preview"><img class="fw-thumb" alt="Attached screenshot" /><button class="fw-remove" type="button" aria-label="Remove screenshot">x</button></div>`
              : `<label class="fw-attach">Attach screenshot<input class="fw-file" type="file" accept="image/*" hidden ${sending || sent ? "disabled" : ""} /></label>`
          }
          ${this.state === "error" ? `<p class="fw-error" role="alert">${escapeHtml(this.errorMessage)}</p>` : ""}
          <button class="fw-submit" ${this.message.trim() === "" || sending || sent ? "disabled" : ""}>${submitLabel}</button>
        </div>
        <button class="fw-fab" aria-expanded="${this.open}">${escapeHtml(this.label)}</button>
      </div>
    `;

    this.root.querySelector(".fw-fab")?.addEventListener("click", this.toggle);
    this.root.querySelector(".fw-close")?.addEventListener("click", this.toggle);
    this.root.querySelectorAll(".fw-chip").forEach((chip) => {
      chip.addEventListener("click", () =>
        this.pick((chip as HTMLElement).dataset.cat ?? this.category),
      );
    });
    const input = this.root.querySelector(".fw-input") as HTMLTextAreaElement | null;
    input?.addEventListener("input", () => {
      this.message = input.value;
      const submit = this.root.querySelector(".fw-submit") as HTMLButtonElement | null;
      if (submit) submit.disabled = this.message.trim() === "";
    });
    this.root
      .querySelector(".fw-submit")
      ?.addEventListener("click", () => void this.doSubmit());

    // Set the preview src as a property (never interpolated) and wire removal.
    const thumb = this.root.querySelector(".fw-thumb") as HTMLImageElement | null;
    if (thumb && this.screenshot) thumb.src = this.screenshot;
    this.root.querySelector(".fw-remove")?.addEventListener("click", () => {
      this.screenshot = null;
      this.render();
    });

    const file = this.root.querySelector(".fw-file") as HTMLInputElement | null;
    file?.addEventListener("change", () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      this.readAsDataUrl(chosen)
        .then((url) => {
          this.screenshot = url;
          this.render();
        })
        .catch(() => {
          /* if the file can't be read, just leave the form as-is */
        });
    });
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("feedback-widget")
) {
  customElements.define("feedback-widget", FeedbackWidget);
}
