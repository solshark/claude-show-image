# claude-show-image

A [Claude Code](https://github.com/anthropics/claude-code) plugin that lets Claude
display image files inline in the terminal transcript.

Claude Code shows images as text placeholders, even in terminals that support inline
graphics ([anthropics/claude-code#79706](https://github.com/anthropics/claude-code/issues/79706)).
Recent builds already contain a kitty graphics protocol renderer, but it is reachable
only through the plugin UI `Image` element. This plugin exposes that renderer as a tool,
so Claude can show you screenshots, charts and other images it produces or finds.

## What it does

- Registers a tool, `mcp__show-image__show_image`, that takes a file `path` and an
  optional width in `columns`.
- Converts non-PNG images (JPEG, HEIC, GIF, TIFF, WebP and anything else `sips` reads)
  to PNG and downsizes images larger than 2048 px on the longest side.
- Draws the image under the tool call in the transcript, scaled to keep its aspect
  ratio, at most 80 columns by 40 rows. It scrolls with the conversation.
- Adds an "open full size" link under each image. Clicking it opens the original file,
  at full resolution, in your default image viewer.
- The image is shown to you only. Its pixels are not sent to the model, so displaying
  an image costs no image tokens.

## Requirements

- macOS. Image conversion and measurement use the built-in `sips` tool.
- Claude Code 2.1.289 or later. The plugin uses the function hooks API, which is in
  early access and may change between releases.
- A terminal in which Claude Code draws images: [Ghostty](https://ghostty.org) or
  [kitty](https://sw.kovidgoyal.net/kitty/) 0.28 or later, not inside tmux or screen.

In any other environment the tool is not registered, so Claude does not try to use it.
Set `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` to skip the terminal check, as Claude Code
itself does.

## Installation

```sh
claude plugin marketplace add solshark/claude-show-image
claude plugin install show-image@claude-show-image
```

Start a new Claude Code session, or run `/reload-plugins` in a running one.

## Usage

Ask Claude to show you an image:

```text
Show me the latest screenshot on my Desktop.
Plot the latency from logs.csv and show me the chart.
```

Claude calls the tool on its own whenever an image would help, for example after it
captures a screenshot or renders a chart.

## Limitations

- iTerm2 is not supported. As of iTerm2 3.7.3, it draws kitty graphics protocol images
  but not Unicode placeholders, which Claude Code's renderer relies on.
- The image box assumes terminal cells are about twice as tall as they are wide. With
  an unusual font, images may look slightly stretched.
- Converted copies are cached under `$TMPDIR/claude-show-image/`, which macOS clears
  periodically.
- Images Claude opens with the `Read` tool and images pasted into the prompt are not
  affected. They are still shown as placeholders.

## Development

```sh
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

Once Claude Code has loaded the plugin, it writes its type declarations to
`.claude-plugin/types/`, and `tsc -p .` type-checks the hooks module.

## Status

This plugin is a stopgap. Once Claude Code renders images natively, it will be
deprecated and this repository archived.

## License

[MIT](LICENSE)
