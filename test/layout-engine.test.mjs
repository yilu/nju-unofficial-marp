import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { Marp } from '@marp-team/marp-core'

import config from '../marp.config.mjs'
import { buildIgnoredLineSet, colIsStillOpenAtCandidateStart, parseColSpan } from '../engine/layout-engine.mjs'

const fixturePath = new URL('./fixtures/layout-sample.md', import.meta.url)

function createRenderer() {
  return config.engine({ marp: new Marp() })
}

function render(markdown) {
  const rendered = createRenderer().render(markdown)
  return typeof rendered === 'string' ? rendered : rendered.html
}

function getSlides(html) {
  return [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)].map(
    ([section]) => section
  )
}

function getSingleMatch(input, pattern) {
  const match = input.match(pattern)
  assert.ok(match, `Expected ${pattern} to match`)
  return match[0]
}

function indexOfOrFail(input, value) {
  const index = input.indexOf(value)
  assert.notEqual(index, -1, `Expected to find ${value}`)
  return index
}

test('layout engine emits slide metadata and semantic wrappers', async () => {
  const markdown = await readFile(fixturePath, 'utf8')
  const html = render(markdown)
  const slides = getSlides(html)

  assert.equal(slides.length, 3)

  assert.match(slides[0], /data-layout="single"/)
  assert.match(slides[0], /class="[^"]*layout-body[^"]*"/)
  assert.match(slides[0], /class="[^"]*layout-col[^"]*"/)
  assert.match(slides[0], /class="[^"]*layout-caption[^"]*"/)
  assert.match(slides[0], /class="[^"]*layout-ref[^"]*"/)
  assert.match(slides[0], /class="[^"]*layout-footer[^"]*"/)
  const singleBody = getSingleMatch(slides[0], /<div class="layout-body">[\s\S]*?<\/div>\s*<div class="layout-footer">/)
  const singleColStart = singleBody.indexOf('<div class="layout-col">')
  const singleCaptionStart = singleBody.indexOf('<div class="layout-caption">')
  const singleRefStart = singleBody.indexOf('<div class="layout-ref">')
  assert.notEqual(singleColStart, -1)
  assert.notEqual(singleCaptionStart, -1)
  assert.notEqual(singleRefStart, -1)
  assert.ok(singleColStart < singleCaptionStart)
  assert.ok(singleCaptionStart < singleRefStart)
  assert.doesNotMatch(singleBody, /Single footer/)

  assert.match(slides[1], /data-layout="cols"/)
  assert.match(slides[1], /style="[^"]*--layout-cols:\s*35fr 65fr;?[^"]*"/)
  assert.match(slides[1], /class="[^"]*layout-body[^"]*"/)
  assert.equal((slides[1].match(/class="[^"]*layout-col[^"]*"/g) ?? []).length, 2)
  assert.match(slides[1], /class="[^"]*layout-footer[^"]*"/)
  const colsBody = getSingleMatch(slides[1], /<div class="layout-body">[\s\S]*?<\/div>\s*<div class="layout-footer">/)
  assert.equal((colsBody.match(/class="layout-col"/g) ?? []).length, 2)
  assert.doesNotMatch(colsBody, /Columns footer/)

  assert.match(slides[2], /data-layout="grid"/)
  assert.match(slides[2], /data-grid="2x2"/)
  assert.match(slides[2], /style="[^"]*--layout-grid-rows:\s*2;?[^"]*"/)
  assert.match(slides[2], /style="[^"]*--layout-grid-cols:\s*2;?[^"]*"/)
  assert.match(slides[2], /class="[^"]*layout-body[^"]*"/)
  assert.equal((slides[2].match(/class="[^"]*layout-col[^"]*"/g) ?? []).length, 4)
  assert.match(slides[2], /class="[^"]*layout-footer[^"]*"/)
})

test('unsupported layout directives do not leak arbitrary slide metadata', () => {
  const html = render('<!-- _layout: surprise-mode -->\n\n# Unsupported\n')
  const [slide] = getSlides(html)

  assert.ok(slide)
  assert.doesNotMatch(slide, /data-layout="surprise-mode"/)
  assert.doesNotMatch(slide, /--layout:\s*surprise-mode/)
})

test('nested caption and ref are repaired into the preceding col only when the col has a stray closer', () => {
  const html = render(`<!-- _layout: single -->

# Nested repair

::: col
A

::: caption
Inner cap
:::

::: ref
Inner ref
:::
:::
`)
  const [slide] = getSlides(html)

  const colStart = indexOfOrFail(slide, '<div class="layout-col">')
  const captionStart = indexOfOrFail(slide, '<div class="layout-caption">')
  const refStart = indexOfOrFail(slide, '<div class="layout-ref">')
  const colClose = slide.indexOf('</div></div></div>', refStart)

  assert.ok(colStart < captionStart)
  assert.ok(captionStart < refStart)
  assert.ok(refStart < colClose)
})

test('fenced code with ::: is ignored by the source-aware repair gate', () => {
  const lines = [
    '::: col',
    'A',
    '',
    '~~~text',
    ' :::',
    '~~~',
    '',
    '::: caption'
  ]
  const ignoredLines = buildIgnoredLineSet([
    { type: 'fence', map: [3, 6] }
  ])

  assert.equal(
    colIsStillOpenAtCandidateStart(lines, ignoredLines, 0, 7),
    true
  )
})

test('top-level caption and ref after completed cols stay outside the cols body', () => {
  const html = render(`<!-- _layout: cols 35 65 -->

# Top-level caption

::: col
A
:::

::: col
B
:::

::: caption
Top caption
:::

::: ref
Top ref
:::
`)
  const [slide] = getSlides(html)

  const body = getSingleMatch(slide, /<div class="layout-body">[\s\S]*?<\/div>\s*<div class="layout-caption">/)
  const bodyStart = indexOfOrFail(slide, '<div class="layout-body">')
  const bodyEnd = bodyStart + body.lastIndexOf('</div>')
  const captionStart = indexOfOrFail(slide, '<div class="layout-caption">')
  const refStart = indexOfOrFail(slide, '<div class="layout-ref">')

  assert.equal((slide.match(/class="layout-col"/g) ?? []).length, 2)
  assert.ok(bodyStart < bodyEnd)
  assert.ok(bodyEnd < captionStart)
  assert.ok(captionStart < refStart)
})

test('interleaved top-level content between cols stays inside the body', () => {
  const html = render(`<!-- _layout: cols 50 50 -->

::: col
Left
:::

Middle note

::: col
Right
:::

::: footer
Footer
:::
`)
  const [slide] = getSlides(html)

  const body = getSingleMatch(slide, /<div class="layout-body">[\s\S]*?<\/div>\s*<div class="layout-footer">/)
  assert.equal((body.match(/class="layout-col"/g) ?? []).length, 2)
  assert.match(body, /Middle note/)
})

test('interleaved top-level layout blocks stay outside the body', () => {
  const html = render(`<!-- _layout: cols 50 50 -->

::: col
Left
:::

::: caption
Top caption
:::

Middle note

::: col
Right
:::

::: footer
Top footer
:::
`)
  const [slide] = getSlides(html)

  const body = getSingleMatch(slide, /<div class="layout-body">[\s\S]*?<\/div>\s*<div class="layout-footer">/)
  const bodyStart = indexOfOrFail(slide, '<div class="layout-body">')
  const captionStart = indexOfOrFail(slide, '<div class="layout-caption">')
  const reopenedBodyStart = slide.indexOf('<div class="layout-body">', captionStart)
  const footerStart = indexOfOrFail(slide, '<div class="layout-footer">')
  const firstBodyClose = slide.indexOf('</div></div>', bodyStart)
  const secondBodyClose = slide.indexOf('</div></div>', reopenedBodyStart)

  assert.equal((body.match(/class="layout-col"/g) ?? []).length, 2)
  assert.match(body, /Middle note/)
  assert.ok(bodyStart < captionStart)
  assert.ok(firstBodyClose < captionStart)
  assert.notEqual(reopenedBodyStart, -1)
  assert.ok(captionStart < reopenedBodyStart)
  assert.notEqual(secondBodyClose, -1)
  assert.ok(secondBodyClose < footerStart)
  assert.match(slide, /class="layout-caption"/)
  assert.match(slide, /class="layout-footer"/)
})

test('top-level caption and ref are not repaired by an unrelated stray closer after completed cols', () => {
  const html = render(`<!-- _layout: cols 1 1 -->

::: col
A
:::

::: col
B
:::

::: caption
Top caption
:::

::: ref
Top ref
:::

:::
`)
  const [slide] = getSlides(html)

  const body = getSingleMatch(slide, /<div class="layout-body">[\s\S]*?<\/div>\s*<div class="layout-caption">/)
  const bodyStart = indexOfOrFail(slide, '<div class="layout-body">')
  const bodyEnd = bodyStart + body.lastIndexOf('</div>')
  const captionStart = indexOfOrFail(slide, '<div class="layout-caption">')
  const refStart = indexOfOrFail(slide, '<div class="layout-ref">')

  assert.equal((slide.match(/class="layout-col"/g) ?? []).length, 2)
  assert.ok(bodyEnd < captionStart)
  assert.ok(captionStart < refStart)
  assert.doesNotMatch(body, /Top caption/)
  assert.doesNotMatch(body, /Top ref/)
})

test('top and bottom blocks stay outside the layout body on column slides', () => {
  const html = render(`<!-- _layout: cols 1 1 -->

# Top and bottom

::: top
- Lead point
- Lead point 2
:::

::: col
Left
:::

::: col
Right
:::

::: bottom
- Interpretation
:::

::: footer
Footer
:::
`)
  const [slide] = getSlides(html)

  const topStart = indexOfOrFail(slide, '<div class="layout-top">')
  const bodyStart = indexOfOrFail(slide, '<div class="layout-body">')
  const bottomStart = indexOfOrFail(slide, '<div class="layout-bottom">')
  const footerStart = indexOfOrFail(slide, '<div class="layout-footer">')
  const body = getSingleMatch(slide, /<div class="layout-body">[\s\S]*?<\/div>\s*<div class="layout-bottom">/)

  assert.match(slide, /class="layout-top"/)
  assert.match(slide, /class="layout-bottom"/)
  assert.equal((body.match(/class="layout-col"/g) ?? []).length, 2)
  assert.ok(topStart < bodyStart)
  assert.ok(bodyStart < bottomStart)
  assert.ok(bottomStart < footerStart)
  assert.doesNotMatch(body, /Lead point/)
  assert.doesNotMatch(body, /Interpretation/)
})

test('caption alignment supports slide defaults and per-caption overrides', () => {
  const html = render(`<!-- _layout: cols 1 1 -->
<!-- _caption_align: right -->

# Caption align

::: col
Left

::: caption
Default caption alignment
:::
:::

::: col
Right

::: caption left
Override to the left
:::
:::
`)
  const [slide] = getSlides(html)

  assert.match(slide, /data-caption-align="right"/)
  assert.match(slide, /style="[^"]*--layout-caption-align:\s*right;?[^"]*"/)
  assert.match(slide, /class="layout-caption"/)
  assert.match(slide, /class="layout-caption align-left"/)
})

test('caption-only columns do not leak stray closer paragraphs', () => {
  const html = render(`<!-- _layout: cols 1 1 -->

# Caption only

::: col
Left

::: caption
Left caption
:::
:::

::: col
Right

::: caption
Right caption
:::
:::
`)
  const [slide] = getSlides(html)

  assert.doesNotMatch(slide, /<p>:::<\/p>/)
  assert.equal((slide.match(/class="layout-caption"/g) ?? []).length, 2)
})

test('malformed recognized layout directives do not emit layout metadata or css vars', () => {
  const html = render(`<!-- _layout: single junk -->

# Bad single

---

<!-- _layout: cols 35 junk -->

# Bad cols

---

<!-- _layout: grid 2x2 junk -->

# Bad grid

---

<!-- _layout: grid 0x2 -->

# Zero rows

---

<!-- _layout: grid 2x0 -->

# Zero cols
`)
  const slides = getSlides(html)

  assert.equal(slides.length, 5)

  for (const slide of slides) {
    assert.doesNotMatch(slide, /data-layout=/)
    assert.doesNotMatch(slide, /data-grid=/)
    assert.doesNotMatch(slide, /--layout-cols:/)
    assert.doesNotMatch(slide, /--layout-grid-rows:/)
    assert.doesNotMatch(slide, /--layout-grid-cols:/)
  }
})

test('parseColSpan parses valid span args', () => {
  assert.deepEqual(parseColSpan(['1-2,1-3']), { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 3 })
  assert.deepEqual(parseColSpan(['1,2']), { rowStart: 1, rowEnd: 1, colStart: 2, colEnd: 2 })
  assert.deepEqual(parseColSpan(['3-5,1-2']), { rowStart: 3, rowEnd: 5, colStart: 1, colEnd: 2 })
})

test('parseColSpan rejects invalid span args', () => {
  assert.equal(parseColSpan([]), null)
  assert.equal(parseColSpan(['left']), null)
  assert.equal(parseColSpan(['abc,1']), null)
  assert.equal(parseColSpan(['2-1,1']), null)
  assert.equal(parseColSpan(['0,1']), null)
  assert.equal(parseColSpan(['1,0']), null)
})

test('col span syntax emits grid placement custom properties', () => {
  const html = render(`<!-- _layout: grid 2x3 -->

# Spanning grid

::: col 1-2,1-2
Big panel
:::

::: col 1,3
Top-right
:::

::: col 2,3
Bottom-right
:::

::: footer
Footer
:::
`)
  const [slide] = getSlides(html)

  assert.match(slide, /--col-row:\s*1\s*\/\s*3/)
  assert.match(slide, /--col-col:\s*1\s*\/\s*3/)
  assert.match(slide, /--col-row:\s*1\s*\/\s*2.*--col-col:\s*3\s*\/\s*4/)
  assert.match(slide, /--col-row:\s*2\s*\/\s*3.*--col-col:\s*3\s*\/\s*4/)
})

test('col without span has no grid placement styles', () => {
  const html = render(`<!-- _layout: grid 2x2 -->

# No spans

::: col
Panel 1
:::

::: col
Panel 2
:::

::: col
Panel 3
:::

::: col
Panel 4
:::
`)
  const [slide] = getSlides(html)

  assert.equal((slide.match(/class="[^"]*layout-col[^"]*"/g) ?? []).length, 4)
  assert.doesNotMatch(slide, /--col-row/)
  assert.doesNotMatch(slide, /--col-col/)
})

test('single-cell explicit placement emits correct properties', () => {
  const html = render(`<!-- _layout: grid 2x2 -->

# Single cell

::: col 1,2
Explicitly in row 1, col 2
:::

::: col
Auto-placed
:::
`)
  const [slide] = getSlides(html)

  assert.match(slide, /--col-row:\s*1\s*\/\s*2.*--col-col:\s*2\s*\/\s*3/)
  assert.doesNotMatch(slide, /style="[^"]*--col-row[^"]*"[^>]*>[^<]*Auto-placed/)
})

test('invalid span syntax is silently ignored', () => {
  const html = render(`<!-- _layout: grid 2x2 -->

# Invalid spans

::: col abc,1
Bad row
:::

::: col 2-1,1
Inverted range
:::

::: col 0,1
Zero row
:::

::: col
Normal
:::
`)
  const [slide] = getSlides(html)

  assert.doesNotMatch(slide, /--col-row/)
  assert.doesNotMatch(slide, /--col-col/)
})

test('span syntax on cols layout is harmless', () => {
  const html = render(`<!-- _layout: cols 1 1 -->

# Cols with span

::: col 1,1
Left
:::

::: col
Right
:::
`)
  const [slide] = getSlides(html)

  assert.match(slide, /data-layout="cols"/)
  assert.equal((slide.match(/class="[^"]*layout-col[^"]*"/g) ?? []).length, 2)
  assert.match(slide, /--col-row/)
})

test('grid with custom column widths emits --layout-cols', () => {
  const html = render(`<!-- _layout: grid 2x2 60 40 -->

# Custom widths

::: col
A
:::

::: col
B
:::

::: col
C
:::

::: col
D
:::
`)
  const [slide] = getSlides(html)

  assert.match(slide, /data-layout="grid"/)
  assert.match(slide, /data-grid="2x2"/)
  assert.match(slide, /--layout-cols:\s*60fr 40fr/)
  assert.equal((slide.match(/class="[^"]*layout-col[^"]*"/g) ?? []).length, 4)
})

test('grid with wrong number of widths is rejected', () => {
  const html = render(`<!-- _layout: grid 2x2 60 40 20 -->

# Wrong count

::: col
A
:::
`)
  const [slide] = getSlides(html)

  assert.doesNotMatch(slide, /data-layout=/)
  assert.doesNotMatch(slide, /--layout-cols/)
})

test('grid with non-numeric widths is rejected', () => {
  const html = render(`<!-- _layout: grid 2x2 wide narrow -->

# Bad widths
`)
  const [slide] = getSlides(html)

  assert.doesNotMatch(slide, /data-layout=/)
})

test('grid with custom row heights emits --layout-rows', () => {
  const html = render(`<!-- _layout: grid 2x2 / 70 30 -->

# Custom rows

::: col
A
:::

::: col
B
:::

::: col
C
:::

::: col
D
:::
`)
  const [slide] = getSlides(html)

  assert.match(slide, /data-layout="grid"/)
  assert.match(slide, /--layout-rows:\s*70fr 30fr/)
  assert.doesNotMatch(slide, /--layout-cols:/)
})

test('grid with custom column widths and row heights emits both', () => {
  const html = render(`<!-- _layout: grid 2x2 60 40 / 70 30 -->

# Both custom

::: col
A
:::

::: col
B
:::

::: col
C
:::

::: col
D
:::
`)
  const [slide] = getSlides(html)

  assert.match(slide, /data-layout="grid"/)
  assert.match(slide, /--layout-cols:\s*60fr 40fr/)
  assert.match(slide, /--layout-rows:\s*70fr 30fr/)
})

test('grid with wrong number of row heights is rejected', () => {
  const html = render(`<!-- _layout: grid 2x2 / 70 30 10 -->

# Wrong row count
`)
  const [slide] = getSlides(html)

  assert.doesNotMatch(slide, /data-layout=/)
})
