// Script-tag entry: registers the element, then self-mounts a floating widget
// using data-* attributes on its own <script> tag.
import "./feedback-widget";

function mountFromScriptTag(): void {
  const current =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector("script[data-endpoint][data-token]");
  if (current === null) return;
  const endpoint = current.getAttribute("data-endpoint");
  const token = current.getAttribute("data-token");
  if (!endpoint || !token) return;

  const el = document.createElement("feedback-widget");
  el.setAttribute("endpoint", endpoint);
  el.setAttribute("token", token);
  for (const name of ["categories", "label", "submitter", "page-context"]) {
    const value = current.getAttribute(`data-${name}`);
    if (value !== null) el.setAttribute(name, value);
  }
  document.body.appendChild(el);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountFromScriptTag);
} else {
  mountFromScriptTag();
}
