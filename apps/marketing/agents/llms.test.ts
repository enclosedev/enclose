import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { markdownFile } from './addresses'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const llms = fs.readFileSync(path.join(root, 'public/llms.txt'), 'utf8')
const lines = llms.split('\n')

/** The site's pages, from the folders in pages/, and the addresses that are not pages but lead somewhere. */
const pages = fs
  .readdirSync(path.join(root, 'pages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, 'pages', entry.name, 'page.tsx')))
  .map((entry) => (entry.name === 'home' ? '/' : `/${entry.name}`))
const elsewhere = ['/download', '/download/intel', '/llms.txt', '/sitemap.xml']

test('llms.txt is laid out as llmstxt.org has it', () => {
  // an H1 with the name, then a blockquote that sums it up
  assert.equal(lines[0], '# Enclose')
  const firstText = lines.slice(1).find((line) => line.trim() !== '')
  assert.ok(firstText?.startsWith('> '), 'a blockquote after the H1')
  // then text with no headings in it, then sections under H2s and nothing deeper
  const headings = lines.filter((line) => /^#{1,6} /.test(line))
  assert.deepEqual(
    headings.filter((line) => !line.startsWith('## ')),
    ['# Enclose'],
  )
  // each H2 section is a list of links, with notes after a colon
  let inSection = false
  for (const line of lines) {
    if (line.startsWith('## ')) inSection = true
    else if (inSection && line.trim() !== '')
      assert.match(line, /^- \[[^\]]+\]\(https:\/\/[^)]+\)(: .+)?$/, `a link in a file list: ${line}`)
  }
})

test('llms.txt says when to use Enclose, and how an agent goes about it', () => {
  const beforeSections = llms.slice(0, llms.indexOf('\n## '))
  assert.match(beforeSections, /When to use Enclose:\n\n(- .+\n)+/)
  assert.match(beforeSections, /How an agent should help/)
})

test('every link to the site in llms.txt leads to something the site has', () => {
  const files = new Set(pages.map(markdownFile))
  for (const [, href] of llms.matchAll(/https:\/\/enclose\.dev(\/[^\s)]*)/g)) {
    const known =
      pages.includes(href) || files.has(href) || elsewhere.includes(href) || fs.existsSync(path.join(root, 'public', href))
    assert.ok(known, `${href} is on the site`)
  }
  // and every page is listed in it, in Markdown
  for (const page of pages) assert.ok(llms.includes(`https://enclose.dev${markdownFile(page)}`), `${page} is listed`)
})

test('the sitemap lists every page, and the missing-page Markdown leads to llms.txt', () => {
  const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8')
  for (const page of pages) assert.ok(sitemap.includes(`<loc>https://enclose.dev${page}</loc>`), `${page} in the sitemap`)
  const missing = fs.readFileSync(path.join(root, 'agents/not-found.md'), 'utf8')
  assert.ok(missing.length >= 20)
  assert.match(missing, /\(https:\/\/enclose\.dev\/llms\.txt\)/)
  assert.match(missing, /\(https:\/\/enclose\.dev\/sitemap\.xml\)/)
})
