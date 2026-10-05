import { expect, test } from 'claude-code/testing'

import { encode, fileUrl } from './register'

const TOOL_ID = 'mcp__show-image__show_image'

test('fileUrl percent-encodes each path segment', async () => {
  expect(fileUrl('/Users/me/My Pics/ship#1.png')).toBe('file:///Users/me/My%20Pics/ship%231.png')
})

test('the result row shows the image and links to the full-size original', async $ => {
  const output = encode({
    path: '/Users/me/ship sheet.png',
    file: '/tmp/claude-show-image/abc.png',
    width: 2048,
    height: 682,
    generation: 1,
    sourceWidth: 4096,
    sourceHeight: 1364,
  })
  const ui = await $.ui.mount({
    plugin: 'show-image',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 'toolu_1',
    props: { tool_use_id: 'toolu_1', tool: TOOL_ID, output, isErrored: false },
    viewport: { columns: 120, rows: 40, isFullscreen: false },
  })

  const image = await ui.find({ type: 'Image' })
  expect(image?.props.columns).toBe(80)
  expect(image?.props.rows).toBe(13)

  const link = await ui.find({ type: 'Link' })
  expect(link?.props.href).toBe('file:///Users/me/ship%20sheet.png')
  expect(link?.text).toContain('open full size')

  expect(await ui.find({ type: 'Text', text: /4096×1364 px/ })).toBeDefined()
})
