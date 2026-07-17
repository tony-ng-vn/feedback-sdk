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
- Event: `feedback-submitted`, `CustomEvent<{ id: string }>`, bubbles + composed
- Theming: override `--fw-accent`, `--fw-surface`, `--fw-surface-strong`, `--fw-text`, `--fw-muted`, `--fw-border`, `--fw-radius`, `--fw-z`

## Usage

npm:

```js
import "feedback-sdk-widget";
// then place <feedback-widget endpoint="..." token="fbk_..."></feedback-widget>
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
