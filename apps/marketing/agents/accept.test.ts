import assert from 'node:assert/strict'
import { test } from 'node:test'
import { negotiate } from './accept'

test('the test vectors acceptmarkdown.com gives', () => {
  assert.equal(negotiate('text/markdown'), 'text/markdown')
  assert.equal(negotiate('text/markdown, text/html;q=0.8'), 'text/markdown')
  assert.equal(negotiate('text/html'), 'text/html')
  assert.equal(negotiate('text/markdown;q=0, text/html'), 'text/html')
  assert.equal(negotiate(null), 'text/html')
  assert.equal(negotiate('*/*'), 'text/html')
})

test('a browser gets HTML, even where it would take anything', () => {
  const chrome =
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
  assert.equal(negotiate(chrome), 'text/html')
  assert.equal(negotiate('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'), 'text/html')
})

test('Markdown wins on quality, then on being named over a wildcard, then on coming first', () => {
  assert.equal(negotiate('text/html;q=0.5, text/markdown'), 'text/markdown')
  assert.equal(negotiate('text/markdown, */*;q=1'), 'text/markdown')
  assert.equal(negotiate('text/markdown, text/html'), 'text/markdown')
  assert.equal(negotiate('text/html, text/markdown'), 'text/html')
  assert.equal(negotiate('text/markdown;q=0.9, text/*;q=0.9'), 'text/markdown')
  assert.equal(negotiate('text/html, text/markdown;q=0.9'), 'text/html')
})

test('the closest entry sets the quality, even below a wildcard', () => {
  assert.equal(negotiate('text/*, text/html;q=0.1'), 'text/markdown')
  assert.equal(negotiate('*/*, text/html;q=0'), 'text/markdown')
})

test('wildcards alone are no preference: HTML', () => {
  assert.equal(negotiate('text/*'), 'text/html')
  assert.equal(negotiate('text/plain, */*;q=0.1'), 'text/html')
})

test('nothing, where neither is taken', () => {
  assert.equal(negotiate('application/pdf'), null)
  assert.equal(negotiate('application/json'), null)
  assert.equal(negotiate('text/markdown;q=0, text/html;q=0'), null)
  assert.equal(negotiate('*/*;q=0'), null)
})

test('case, spaces and other parameters do not matter; a broken quality is skipped', () => {
  assert.equal(negotiate('Text/Markdown; charset=UTF-8; variant=GFM'), 'text/markdown')
  assert.equal(negotiate('  text/markdown ;  q = 0.7 , text/html ; q=0.6'), 'text/markdown')
  assert.equal(negotiate('text/markdown;q=high, text/html'), 'text/html')
  assert.equal(negotiate(''), 'text/html')
  assert.equal(negotiate('   '), 'text/html')
})
