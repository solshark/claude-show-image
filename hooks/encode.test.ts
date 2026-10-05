import { expect, test } from 'claude-code/testing'

import { decode, encode } from './register'

const SHOWN = {
  path: '/Users/me/Downloads/photo.jpg',
  file: '/tmp/claude-show-image/abc.png',
  width: 1200,
  height: 800,
  generation: 1759690000000,
}

test('the result is text and decodes back to the same details', async () => {
  const text = encode(SHOWN)
  expect(typeof text).toBe('string')
  expect(decode(text)).toEqual(SHOWN)
})

test('details decode from a result stored as text blocks', async () => {
  expect(decode([{ type: 'text', text: encode(SHOWN) }])).toEqual(SHOWN)
})

test('a result without the details decodes to nothing', async () => {
  expect(decode('Shown to the user')).toBeUndefined()
  expect(decode(undefined)).toBeUndefined()
  expect(decode('show-image:{not json')).toBeUndefined()
})
