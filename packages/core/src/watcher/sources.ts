// GALAXIA Watcher — curated source fetchers.
//
// Each fetch function returns raw entries that the analyze step will
// hand to the LLM for summarization + relevance filtering. We use only
// free, auth-free APIs/feeds so the watcher works out of the box.

export interface RawEntry {
  source: 'hacker-news' | 'arxiv';
  title: string;
  url?: string;
  body: string;        // short excerpt, already truncated
  ts: string;          // ISO
}

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM = (id: number): string => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const ARXIV_CS_AI = 'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.SE&sortBy=submittedDate&sortOrder=descending&max_results=15';

async function fetchJson<T>(url: string, timeoutMs: number = 10_000): Promise<T | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

async function fetchText(url: string, timeoutMs: number = 10_000, maxBytes: number = 200_000): Promise<string | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    return new TextDecoder().decode(slice as ArrayBuffer);
  } catch { return null; }
}

/** Pull the top 10 HN stories (id → title + url). */
export async function fetchHackerNews(limit: number = 10): Promise<RawEntry[]> {
  const ids = await fetchJson<number[]>(HN_TOP);
  if (!ids) return [];
  const selected = ids.slice(0, limit);
  const items = await Promise.all(selected.map((id) =>
    fetchJson<{ id: number; title?: string; url?: string; time?: number; by?: string }>(HN_ITEM(id)),
  ));
  const now = new Date().toISOString();
  return items.filter((x): x is NonNullable<typeof x> => Boolean(x)).map((it) => ({
    source: 'hacker-news' as const,
    title: it.title ?? `HN item ${it.id}`,
    url: it.url ?? `https://news.ycombinator.com/item?id=${it.id}`,
    body: it.title ?? '',
    ts: it.time ? new Date(it.time * 1000).toISOString() : now,
  }));
}

/** Pull recent Arxiv papers in cs.AI / cs.LG / cs.SE. Atom XML — light parse. */
export async function fetchArxiv(limit: number = 8): Promise<RawEntry[]> {
  const xml = await fetchText(ARXIV_CS_AI, 12_000, 300_000);
  if (!xml) return [];
  const entries: RawEntry[] = [];
  // Very light Atom parsing — extract <entry>...</entry> blocks.
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) && entries.length < limit) {
    const block = match[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(block)?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(block)?.[1]?.trim().replace(/\s+/g, ' ').slice(0, 400) ?? '';
    const url = /<id>([\s\S]*?)<\/id>/.exec(block)?.[1]?.trim() ?? '';
    const published = /<published>([\s\S]*?)<\/published>/.exec(block)?.[1]?.trim();
    if (!title) continue;
    entries.push({
      source: 'arxiv',
      title,
      url,
      body: summary,
      ts: published ?? new Date().toISOString(),
    });
  }
  return entries;
}

/** Fetch arbitrary URL text (for /watch user submissions with a URL). */
export async function fetchUrlContent(url: string): Promise<{ title: string; body: string } | null> {
  const text = await fetchText(url, 15_000, 200_000);
  if (!text) return null;
  // Strip HTML tags if the content looks like HTML — simple regex, not bulletproof.
  const isHtml = /<html[\s>]|<!doctype/i.test(text);
  let body = text;
  let title = url;
  if (isHtml) {
    title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]?.trim().slice(0, 200) ?? url;
    body = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  }
  return { title, body };
}
