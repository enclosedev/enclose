import assert from 'node:assert/strict'
import { test } from 'node:test'
import { headingSkips, pageToMarkdown } from './markdown'

const page = `<!doctype html><html><head><title>T</title><script>x()</script></head><body>
<header class="header"><a href="/">Home</a></header>
<main class="home">
  <h1>Enclose is a <span>workbench</span>.</h1>
  <p>It works with <a href="https://claude.com">Claude</a> and <code>build123d</code>.</p>
  <div><a href="/download" aria-label="Download for Mac"><svg><path d="M0 0"/></svg></a><a href="/linux" aria-label="Download for Linux"><svg/></a></div>
  <div class="app" role="img" aria-label="The window"><strong>Front View</strong></div>
  <script>window.fit()</script>
  <h2>Every project in view</h2>
  <ul><li>one;</li><li>two</li></ul>
  <footer><a href="/terms">Terms</a></footer>
</main></body></html>`

test('a page in Markdown is what its <main> says, with whole links', () => {
  const markdown = pageToMarkdown(page, 'https://enclose.dev/')
  assert.equal(
    markdown,
    [
      '# Enclose is a workbench.',
      '',
      'It works with [Claude](https://claude.com/) and `build123d`.',
      '',
      '[Download for Mac](https://enclose.dev/download)',
      '',
      '[Download for Linux](https://enclose.dev/linux)',
      '',
      '## Every project in view',
      '',
      '-   one;',
      '-   two',
      '',
      '[Terms](https://enclose.dev/terms)',
      '',
    ].join('\n'),
  )
})

test('a link relative to a page other than the home page is made whole from it', () => {
  const markdown = pageToMarkdown('<main><a href="contact">Contact</a></main>', 'https://enclose.dev/about')
  assert.equal(markdown, '[Contact](https://enclose.dev/contact)\n')
})

test('a page without <main> is an error, not an empty document', () => {
  assert.throws(() => pageToMarkdown('<p>x</p>', 'https://enclose.dev/x'), /no <main>/)
})

test('headings that go down a level at a time are no skip', () => {
  assert.deepEqual(headingSkips('<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><h1>e</h1>'), [])
})

test('a heading two levels down, or a first one that is not h1, is', () => {
  assert.deepEqual(headingSkips('<h1>a</h1><h3 class="x">b</h3>'), ['h1 to h3'])
  assert.deepEqual(headingSkips('<h2>a</h2>'), ['begins at h2'])
  assert.deepEqual(headingSkips('<header><h1>a</h1></header>'), [])
})
