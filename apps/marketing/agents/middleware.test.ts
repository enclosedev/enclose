import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addressOf, addressOfFile, markdownFile } from './addresses'
import { respond, type Documents } from './middleware'

const documents: Documents = {
  pages: { '/': '# Home\n', '/privacy': '# Privacy\n' },
  missing: '# Not found\n\nSee [llms.txt](https://enclose.dev/llms.txt).\n',
  origin: 'https://enclose.dev',
}

const ask = (path: string, accept?: string, method = 'GET') =>
  respond(
    new Request(`https://enclose.dev${path}`, { method, headers: accept === undefined ? {} : { accept } }),
    documents,
  )

const goesOn = (response: Response) => response.headers.get('x-middleware-next') === '1'

test('a page asked for in Markdown is its Markdown, varying by Accept', async () => {
  const response = ask('/', 'text/markdown')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8')
  assert.equal(response.headers.get('vary'), 'Accept')
  assert.equal(response.headers.get('link'), '<https://enclose.dev/>; rel="canonical"')
  assert.equal(await response.text(), '# Home\n')
  assert.ok(!goesOn(response))
})

test('a slash at the end and a query make no difference', async () => {
  assert.equal(await ask('/privacy/', 'text/markdown').text(), '# Privacy\n')
  assert.equal(await ask('/privacy?from=x', 'text/markdown').text(), '# Privacy\n')
})

test('an address with no page is a 404 in Markdown that says where to go', async () => {
  const response = ask('/__ora-404-probe-s4btmgnx', 'text/markdown')
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8')
  assert.equal(response.headers.get('vary'), 'Accept')
  assert.equal(response.headers.get('link'), null)
  assert.match(await response.text(), /llms\.txt/)
})

test('HTML, anything or no Accept at all goes on to the page as it is', () => {
  assert.ok(goesOn(ask('/', 'text/html')))
  assert.ok(goesOn(ask('/', '*/*')))
  assert.ok(goesOn(ask('/')))
  assert.ok(goesOn(ask('/', 'text/markdown;q=0, text/html')))
  assert.ok(goesOn(ask('/nowhere', 'text/html')))
})

test('neither taken is a 406 that says what is', async () => {
  const response = ask('/', 'application/pdf')
  assert.equal(response.status, 406)
  assert.equal(response.headers.get('vary'), 'Accept')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const said = await response.text()
  assert.match(said, /text\/html/)
  assert.match(said, /text\/markdown/)
})

test('HEAD has the headers and no body; other methods go on', async () => {
  const response = ask('/', 'text/markdown', 'HEAD')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8')
  assert.equal(await response.text(), '')
  assert.ok(goesOn(ask('/', 'text/markdown', 'POST')))
})

test("a page's Markdown as a file is that, whatever the Accept, and does not vary", async () => {
  for (const accept of ['text/html', '*/*', 'text/markdown', undefined]) {
    const response = ask('/index.html.md', accept)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8')
    assert.equal(response.headers.get('vary'), null)
    assert.equal(response.headers.get('link'), '<https://enclose.dev/>; rel="canonical"')
    assert.equal(await response.text(), '# Home\n')
  }
  assert.equal(await ask('/privacy.md', 'text/html').text(), '# Privacy\n')
  assert.equal(await ask('/privacy.md', 'text/html', 'HEAD').text(), '')
  const missing = ask('/nowhere.md', 'text/html')
  assert.equal(missing.status, 404)
  assert.match(await missing.text(), /llms\.txt/)
})

test('addresses and the files their Markdown is kept in', () => {
  assert.equal(addressOf('/'), '/')
  assert.equal(addressOf('/terms/'), '/terms')
  assert.equal(markdownFile('/'), '/index.html.md')
  assert.equal(markdownFile('/terms'), '/terms.md')
  for (const address of ['/', '/terms', '/a/b']) assert.equal(addressOfFile(markdownFile(address)), address)
  assert.equal(addressOfFile('/'), null)
  assert.equal(addressOfFile('/terms'), null)
  assert.equal(addressOfFile('/.md'), null)
})
