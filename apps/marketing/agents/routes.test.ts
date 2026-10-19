import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MARKDOWN_ROUTES, NAMES_MARKDOWN, PAGE, TAKES_HTML } from './routes'

const page = new RegExp(PAGE)
const namesMarkdown = new RegExp(NAMES_MARKDOWN)
const takesHtml = new RegExp(TAKES_HTML)

/** Whether Vercel would run the middleware first, as the two routes have it. */
const toMiddleware = (path: string, accept?: string) =>
  page.test(path) && (accept === undefined ? true : namesMarkdown.test(accept) || !takesHtml.test(accept))

test('pages are addresses the middleware can see; files, assets and actions are not', () => {
  for (const path of ['/', '/privacy', '/privacy/', '/about', '/__ora-404-probe-s4btmgnx', '/a/b'])
    assert.ok(page.test(path), path)
  for (const path of ['/llms.txt', '/index.html.md', '/og.png', '/assets/x', '/__modulato/action/x'])
    assert.ok(!page.test(path), path)
})

test('a browser goes straight to the page', () => {
  assert.ok(!toMiddleware('/', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'))
  assert.ok(!toMiddleware('/', '*/*'))
  assert.ok(!toMiddleware('/', 'text/*'))
})

test('a request that names Markdown, takes neither, or says nothing goes to the middleware', () => {
  assert.ok(toMiddleware('/', 'text/markdown'))
  assert.ok(toMiddleware('/', 'text/html, text/markdown;q=0.9'))
  assert.ok(toMiddleware('/nowhere', 'text/markdown'))
  assert.ok(toMiddleware('/', 'application/pdf'))
  assert.ok(toMiddleware('/'))
  assert.ok(!toMiddleware('/llms.txt', 'text/markdown'))
})

test('the routes run the middleware and go on, for pages and for their Markdown as files', () => {
  const [files, ...pages] = MARKDOWN_ROUTES
  for (const path of ['/index.html.md', '/privacy.md']) assert.ok(new RegExp(files.src).test(path), path)
  assert.ok(!new RegExp(files.src).test('/'))
  // whatever the Accept: a file's address is the file
  assert.equal(files.has, undefined)
  assert.equal(files.missing, undefined)
  assert.equal(pages.length, 2)
  for (const route of MARKDOWN_ROUTES) {
    assert.equal(route.middlewarePath, '_middleware')
    assert.equal(route.continue, true)
  }
})
