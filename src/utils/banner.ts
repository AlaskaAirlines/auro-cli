/**
 * Bordered, colored terminal banners for advisories that must not scroll past
 * unnoticed. The prominent cousin of a plain `⚠ ...` stderr line: a boxed heading
 * plus word-wrapped bullet messages, mirroring the box/heading treatment of
 * {@link renderOutdatedBanner} in ./outdated.ts so the two read as a family.
 *
 * Presentation only — no IO. Callers pass already-composed message strings and
 * print the result (typically to stderr, keeping stdout clean for piped output).
 * Colors degrade automatically: chalk disables them when the stream is not a TTY
 * (redirected to a file, captured in a test), while the border and heading keep
 * the banner legible without them.
 */

import chalk from "chalk";

/** Banner accent, applied to the border, heading, and message text. */
export type BannerColor = "red" | "yellow";

/** The box never grows past this many columns, so it fits a standard terminal. */
const MAX_WIDTH = 78;

/** Content column budget for wrapped message text (leaves a small margin). */
const CONTENT_WIDTH = 74;

const BULLET = "  • ";
const CONTINUATION_INDENT = "    ";

/**
 * Word-wrap `text` to at most `width` columns, breaking on whitespace only. A
 * single word longer than `width` is left intact on its own line (overflow)
 * rather than hard-split, so tokens like `Class.register('my-tag')` stay
 * copy-pasteable. Never returns an empty array — a blank input yields `[""]`.
 */
function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Render `messages` as a bordered banner under `heading`, accented in `color`.
 * Each message becomes a wrapped bullet; long messages continue on indented
 * lines. Returns `""` for an empty `messages` list so a caller can emit
 * unconditionally (`console.error(renderWarningBanner(...))`).
 *
 * The border width tracks the heading (never past {@link MAX_WIDTH}); a `⚠`
 * (U+26A0) in the heading renders as two columns but counts as one char, so its
 * width is nudged by one to keep the border from falling a column short — the
 * same correction {@link renderOutdatedBanner} applies.
 */
export function renderWarningBanner(
  heading: string,
  messages: string[],
  color: BannerColor = "red",
): string {
  if (messages.length === 0) {
    return "";
  }

  const accent = chalk[color].bold;

  const body: string[] = [];
  messages.forEach((message, index) => {
    const wrapped = wrapText(message, CONTENT_WIDTH - BULLET.length);
    wrapped.forEach((line, lineIndex) => {
      const prefix = lineIndex === 0 ? BULLET : CONTINUATION_INDENT;
      body.push(chalk[color](prefix + line));
    });
    // Blank spacer between messages for readability (never after the last).
    if (index < messages.length - 1) {
      body.push("");
    }
  });

  const headingWidth = heading.length + (heading.includes("⚠") ? 1 : 0);
  const width = Math.min(Math.max(headingWidth, CONTENT_WIDTH), MAX_WIDTH);
  const border = "─".repeat(width);

  return [
    "",
    accent(`┌${border}┐`),
    accent(heading),
    accent(`└${border}┘`),
    ...body,
    "",
  ].join("\n");
}
