# nju-unofficial-marp

A minimal Marp slide template for academic talks, with an NJU-inspired look.
Markdown-first authoring, one layout directive per slide, PDF-first output.

> **Not an official Nanjing University template.** Inspired by NJU aesthetics, but independent and unofficial.

**[Preview the demo deck (PDF)](dist/demo.pdf)**

## Quick start

```bash
npm install
npm run pdf      # renders slides/demo.md → dist/demo.pdf
npm run html     # renders slides/demo.md → dist/demo.html
npm test         # runs layout-engine tests
```

Requires Node.js. Marp CLI is installed as a dev dependency.

## Create your own talk

1. Copy `slides/demo.md` to a new file (e.g. `slides/my-talk.md`).
2. Keep the front matter and `theme: nju-unofficial`.
3. Replace placeholder images under `slides/figures/` with your own.
4. Update the build commands in `package.json` to point to your file.

## Layout directives

Each slide gets one layout directive as an HTML comment:

| Directive | Effect |
|-----------|--------|
| `<!-- _layout: single -->` | One centered panel |
| `<!-- _layout: cols 1 1 -->` | Two equal columns |
| `<!-- _layout: cols 5 4 -->` | Two columns, custom ratio |
| `<!-- _layout: cols 1 1 1 -->` | Three columns |
| `<!-- _layout: grid 2x2 -->` | 2-row, 2-column grid |
| `<!-- _layout: grid 2x3 -->` | 2-row, 3-column grid |

`cols` accepts any positive numeric sequence. `grid` accepts `ROWSxCOLS`.

## Containers

Inside a layout slide, use fenced containers:

| Container | Purpose |
|-----------|---------|
| `::: col` | One panel (figure, text, or code) |
| `::: caption` | Short message under a panel or spanning all columns |
| `::: ref` | Source or provenance line |
| `::: top` | Text above the column body |
| `::: bottom` | Text below the column body |
| `::: footer` | Slide-level footer at the bottom edge |

Caption alignment: `::: caption left`, `::: caption center`, `::: caption right`, or set a slide default with `<!-- _caption_align: right -->`.

Vertical alignment: `<!-- _valign: start -->` top-aligns content in column layouts.

## Math

Enable MathJax in front matter:

```yaml
math: mathjax
```

Then use `$...$` for inline and `$$...$$` for display math. See `slides/snippets/latex-example.md` for examples.

## Logo

The title slide uses a normal Markdown image for the logo:

```markdown
![w:110](./figures/logo.svg)
```

Replace `slides/figures/logo.svg` with your own, or change the image path.

## Project structure

```
├── themes/nju-unofficial.css    # theme stylesheet
├── engine/layout-engine.mjs     # Marpit layout plugin
├── marp.config.mjs              # Marp CLI configuration
├── slides/
│   ├── demo.md                  # self-documenting demo deck
│   ├── figures/                 # placeholder images and logo
│   └── snippets/                # copy-paste layout and math examples
├── test/                        # layout-engine tests
└── dist/demo.pdf                # pre-built demo PDF
```

## License

MIT
