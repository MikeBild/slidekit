# Examples

Sample input decks. These are **inputs** to the service — they are *not* bundled
into the server or the binary.

- `demo.md` — a generic deck exercising cover, two-cols, `v-clicks`, Mermaid and
  a code fence with the bundled themes.

Preview locally with Slidev:

```bash
npm run dev          # serves examples/demo.md at http://localhost:3030
```

Render to a single self-contained HTML via the service:

```bash
npm run serve        # http://localhost:4030
curl --data-binary @examples/demo.md -H 'content-type: text/markdown' \
  'http://localhost:4030/render?theme=editorial&download=1' -o demo.html
open demo.html       # offline; presenter mode at demo.html#/presenter/1
```
