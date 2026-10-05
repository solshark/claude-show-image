import type { EngineInterface, Register } from 'claude-code'

import { fitCells } from './fit'

const TOOL = 'show_image'
const TOOL_ID = 'mcp__show-image__show_image'
// Longest side, in pixels, of the PNG handed to the terminal.
const MAX_SIDE = 2048
const MAX_COLUMNS = 80
const MAX_ROWS = 40
// Prefix of the result line that carries what the render hook needs; a tool's
// result must be text, so the details travel as JSON inside it.
const MARKER = 'show-image:'

type Shown = {
  path: string
  file: string
  width: number
  height: number
  generation: number
  columns?: number
  // Dimensions of the original file, before any downscaling.
  sourceWidth?: number
  sourceHeight?: number
}

type Probe = { width: number; height: number; format: string }

function isShown(value: unknown): value is Shown {
  if (typeof value !== 'object' || value === null) return false
  const shown = value as Record<string, unknown>

  return (
    typeof shown.path === 'string' &&
    typeof shown.file === 'string' &&
    typeof shown.width === 'number' &&
    typeof shown.height === 'number'
  )
}

export function encode(shown: Shown): string {
  return `Shown to the user: ${shown.path} (${shown.width}×${shown.height} px)\n${MARKER}${JSON.stringify(shown)}`
}

/** Reads the details back from a result stored as text or as text blocks. */
export function decode(output: unknown): Shown | undefined {
  const text =
    typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? output.map(block => (typeof block?.text === 'string' ? block.text : '')).join('\n')
        : ''
  const line = text.split('\n').find(one => one.startsWith(MARKER))
  if (line === undefined) return undefined
  try {
    const shown: unknown = JSON.parse(line.slice(MARKER.length))
    return isShown(shown) ? shown : undefined
  } catch {
    return undefined
  }
}

/** A `file://` URL for an absolute path, each segment percent-encoded. */
export function fileUrl(path: string): string {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`
}

const isSet = (value: string | undefined) =>
  value !== undefined && value !== '' && value !== '0' && value !== 'false'

/**
 * Whether Claude Code draws `Image` elements in this terminal: it does so in
 * Ghostty and kitty, never inside tmux or screen, unless
 * CLAUDE_CODE_FORCE_TERMINAL_IMAGES overrides its detection.
 */
async function canDrawImages($: EngineInterface): Promise<boolean> {
  if (isSet(await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'))) return true
  if (isSet(await $.env.get('TMUX')) || isSet(await $.env.get('STY'))) return false
  const program = (await $.env.get('TERM_PROGRAM')) ?? ''
  const term = (await $.env.get('TERM')) ?? ''

  return (
    program === 'ghostty' ||
    term === 'xterm-ghostty' ||
    term === 'xterm-kitty' ||
    isSet(await $.env.get('KITTY_WINDOW_ID'))
  )
}

/** Whether macOS `sips`, which reads and converts the images, is available. */
async function hasSips($: EngineInterface): Promise<boolean> {
  try {
    return (await $.process.run(['/usr/bin/which', 'sips'])).exitCode === 0
  } catch {
    return false
  }
}

async function probe($: EngineInterface, file: string): Promise<Probe | undefined> {
  const run = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', file])
  if (run.exitCode !== 0) return undefined
  const width = Number(/pixelWidth: (\d+)/.exec(run.stdout)?.[1])
  const height = Number(/pixelHeight: (\d+)/.exec(run.stdout)?.[1])
  const format = /format: (\S+)/.exec(run.stdout)?.[1] ?? ''
  if (!(width > 0 && height > 0)) return undefined

  return { width, height, format }
}

async function digest(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

  return [...bytes.slice(0, 8)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function cacheDir($: EngineInterface): Promise<string> {
  const tmp = ((await $.env.get('TMPDIR')) ?? '/tmp').replace(/\/+$/, '')

  return `${tmp}/claude-show-image`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!(await canDrawImages($)) || !(await hasSips($))) return next(e)

    await $.tool.register({
      name: TOOL,
      description:
        'Displays an image file to the user inline in the terminal transcript. ' +
        'Use it whenever the user should see an image: a screenshot you captured, ' +
        'a chart, diagram or picture you generated, or an image file the user asks ' +
        'to look at. Call it once the file exists, rather than describing the image ' +
        'or asking the user to open it. The image is shown to the user only and is ' +
        'not sent to the model. Reads PNG, JPEG, HEIC, GIF, TIFF, BMP and other ' +
        'formats macOS sips can read.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path of the image: absolute, relative to the working directory, or starting with ~.',
          },
          columns: {
            type: 'integer',
            minimum: 4,
            maximum: 255,
            description: `Width in terminal columns. Defaults to fit the transcript, at most ${MAX_COLUMNS}.`,
          },
        },
        required: ['path'],
      },
    })

    return next(e)
  })

  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    const raw = typeof e.path === 'string' ? e.path.trim() : ''
    if (raw === '') return { deny: 'show_image needs a path.' }
    const home = (await $.env.get('HOME')) ?? ''
    const wanted = raw === '~' ? home : raw.startsWith('~/') ? home + raw.slice(1) : raw

    let real: string | undefined
    let mtimeMs = 0
    try {
      const stat = await $.fs.stat(wanted, { resolve: true })
      if (stat.kind !== 'file') return { deny: `${raw} is not a file.` }
      real = stat.realPath
      mtimeMs = stat.mtimeMs
    } catch {
      return { deny: `${raw} does not exist.` }
    }
    if (real === undefined) return { deny: `${raw} could not be resolved.` }

    const source = await probe($, real)
    if (source === undefined) return { deny: `${raw} is not an image sips can read.` }

    let file = real
    let { width, height } = source
    const isOversized = Math.max(width, height) > MAX_SIDE
    if (source.format !== 'png' || isOversized) {
      const dir = await cacheDir($)
      const out = `${dir}/${await digest(`${real}:${mtimeMs}`)}.png`
      const resize = isOversized ? ['-Z', String(MAX_SIDE)] : []
      await $.process.run(['mkdir', '-p', dir])
      const converted = await $.process.run(
        ['sips', '-s', 'format', 'png', ...resize, real, '--out', out],
        { timeoutMs: 60_000 },
      )
      const result = converted.exitCode === 0 ? await probe($, out) : undefined
      if (result === undefined) {
        return { deny: `Could not convert ${raw} to PNG: ${converted.stderr.trim()}` }
      }
      file = out
      width = result.width
      height = result.height
    }

    const columns = typeof e.columns === 'number' ? Math.round(e.columns) : undefined
    const shown: Shown = {
      path: real,
      file,
      width,
      height,
      generation: Math.floor(mtimeMs),
      sourceWidth: source.width,
      sourceHeight: source.height,
      ...(columns === undefined ? {} : { columns }),
    }

    return { result: encode(shown) }
  })

  on('ui.render', { component: 'ToolResult', props: { tool: TOOL_ID } }, async ($, e, next) => {
    const shown = decode(e.props.output)
    if (e.surface !== 'terminal' || e.props.isErrored || shown === undefined) return next(e)
    const { Box, Text, Image, Link } = $.ui.resolve(e)
    const room = Math.max(8, (e.viewport?.columns ?? MAX_COLUMNS) - 6)
    const { columns, rows } = fitCells(
      shown.width,
      shown.height,
      Math.min(shown.columns ?? MAX_COLUMNS, room),
      MAX_ROWS,
    )
    const name = shown.path.split('/').pop() ?? shown.path

    return (
      <Box flexDirection="column">
        <Image
          source={{ file: shown.file, format: 'png', generation: shown.generation }}
          columns={columns}
          rows={rows}
          alt={`[image: ${name}]`}
        />
        <Text dimColor>
          {name} · {shown.sourceWidth ?? shown.width}×{shown.sourceHeight ?? shown.height} px ·{' '}
          <Link href={fileUrl(shown.path)}>open full size</Link>
        </Text>
      </Box>
    )
  })
}
