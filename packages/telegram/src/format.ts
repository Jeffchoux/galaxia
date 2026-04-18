// GALAXIA Telegram — formatting helpers (MarkdownV2 escape + timezone).

// Characters the Telegram MarkdownV2 parser treats as syntax. Any of these
// inside plain text must be backslash-escaped or Telegram returns 400
// "can't parse entities". We cover the full set from the Bot API docs.
const MD2_RESERVED = /[_*\[\]()~`>#+\-=|{}.!\\]/g;

/**
 * Escape a plain-text value so it can safely appear inside a MarkdownV2
 * message body. Do NOT apply this to text that is itself MarkdownV2 syntax
 * (e.g. a pre-formatted table of backtick-wrapped cells) — only to dynamic
 * user-supplied or data-supplied strings.
 */
export function escapeMd2(input: string): string {
  return input.replace(MD2_RESERVED, (ch) => `\\${ch}`);
}

/**
 * Wrap a string as MarkdownV2 inline code. Inside a code span, every
 * backtick and backslash still needs escaping; nothing else does.
 */
export function code(input: string): string {
  return '`' + input.replace(/([`\\])/g, '\\$1') + '`';
}

/**
 * Wrap a string as MarkdownV2 bold. The caller is responsible for ensuring
 * the inner text is already safe (either pre-escaped with escapeMd2 or a
 * literal they control).
 */
export function bold(safeInner: string): string {
  return `*${safeInner}*`;
}

// ── Timezone conversion ────────────────────────────────────────────────────

/**
 * Format an ISO-8601 timestamp into a human-readable string in the given
 * IANA timezone. Falls back to UTC ISO if the timezone is invalid, and to
 * the raw input if the timestamp itself is malformed. Never throws —
 * Telegram handlers call this on every response and must stay resilient.
 */
export function formatInTz(iso: string, tz: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const grab = (t: string): string => parts.find((p) => p.type === t)?.value ?? '??';
    return `${grab('year')}-${grab('month')}-${grab('day')} ${grab('hour')}:${grab('minute')}:${grab('second')} ${tz}`;
  } catch {
    return d.toISOString();
  }
}

/**
 * Short "time ago" helper, mirrors the CLI's timeSince() in feel. Good for
 * inline status lines where the exact timestamp isn't needed.
 */
export function timeSince(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'in the future';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function resolveTimezone(configTz: string | undefined): string {
  return configTz && configTz.length > 0 ? configTz : 'UTC';
}
