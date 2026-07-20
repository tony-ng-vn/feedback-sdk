# feedback-sdk-widget

A framework-agnostic feedback button. Renders in Shadow DOM; themeable via CSS custom properties.

## Contract (frozen)

- Element: `<feedback-widget>`
- Attributes:
  - `endpoint` (required) -- the service HTTP base, e.g. `https://xxx.convex.site`
  - `token` (required) -- the project's public submit token (`fbk_...`)
  - `categories` (optional) -- comma-separated; default `idea,bug,other`
  - `page-context` (optional) -- default `location.pathname + location.search`
  - `label` (optional) -- button text; default `Feedback`
  - `submitter` (optional) -- identity string; omitted means anonymous
  - `theme` (optional) -- `light` (default), `dark`, or `auto` (follows the OS
    via `prefers-color-scheme`). Your `--fw-*` overrides still win over it.
- Event: `feedback-submitted`, `CustomEvent<{ id: string }>`, bubbles + composed
- Theming: override `--fw-accent`, `--fw-surface`, `--fw-surface-strong`, `--fw-text`, `--fw-muted`, `--fw-border`, `--fw-radius`, `--fw-z`

## Usage

This package is only the widget. `endpoint` and `token` come from a running
feedback-sdk service -- ask its owner for them, or see
[`INTEGRATING.md`](https://github.com/tony-ng-vn/feedback-sdk/blob/main/INTEGRATING.md)
in the main repo for the full playbook. You do not need that repo's source to
use this package.

The widget is a browser custom element.
As of 0.3.0 a top-level import is SSR-safe: on the server the element simply does not register, and it upgrades normally in the browser.
On 0.2.x and older a top-level import crashes server-rendering frameworks (Next.js, SvelteKit, Nuxt); use the client-only dynamic-import patterns below there.

Plain client-side app (Vite/CRA, no SSR):

```js
import "feedback-sdk-widget";
// then place <feedback-widget endpoint="..." token="fbk_..."></feedback-widget>
```

React / Next.js -- import in an effect:

```jsx
import { useEffect } from "react";
export function Feedback({ endpoint, token }) {
  useEffect(() => { import("feedback-sdk-widget"); }, []);
  return <feedback-widget endpoint={endpoint} token={token} />;
}
```

SvelteKit -- import in `onMount` (browser only):

```svelte
<script>
  import { onMount } from "svelte";
  onMount(() => import("feedback-sdk-widget"));
</script>
<feedback-widget {endpoint} {token}></feedback-widget>
```

script tag (self-mounts a floating button from data-attrs):

```html
<script src="https://.../feedback-widget.iife.js"
        data-endpoint="https://xxx.convex.site"
        data-token="fbk_..."></script>
```

Note: when serving the script from a public CDN, add Subresource Integrity
(`integrity="sha384-..." crossorigin="anonymous"`) using the hash of the built
file.

## Build outputs

- `dist/feedback-widget.js` -- ESM, registers the element on import
- `dist/feedback-widget.iife.js` -- self-mounting script-tag bundle
