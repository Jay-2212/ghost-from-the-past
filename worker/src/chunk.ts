/**
 * Markdown-aware chunking. Pure function (no Cloudflare globals) so it unit-tests in Node.
 *
 * - splits into blocks on blank lines and headings, keeping fenced code blocks whole
 * - greedily packs blocks to ~TARGET chars (hard MAX), oversized blocks are hard-split
 * - consecutive chunks overlap by ~OVERLAP chars (tail of the previous chunk)
 * - each chunk remembers its nearest heading
 * - at most maxChunks chunks are returned (the first ones)
 */

export interface Chunk {
  idx: number;
  text: string;
  heading: string;
}

export const TARGET = 900;
export const MAX = 1200;
export const OVERLAP = 120;

interface Block {
  text: string;
  heading: string;
}

function toBlocks(markdown: string, title: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let heading = title;
  let buf: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) blocks.push({ text, heading });
    buf = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence) flush();
      inFence = !inFence;
      buf.push(line);
      if (!inFence) flush();
      continue;
    }
    if (inFence) {
      buf.push(line);
      continue;
    }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim() || heading;
      buf.push(line);
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return blocks;
}

function hardSplit(text: string, size: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf(' ', size);
    if (cut < size * 0.5) cut = size;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function tail(text: string, n: number): string {
  if (text.length <= n) return text;
  const t = text.slice(-n);
  const sp = t.indexOf(' ');
  return sp > 0 && sp < n / 2 ? t.slice(sp + 1) : t;
}

export function chunkMarkdown(markdown: string, title = '', maxChunks = 8): Chunk[] {
  if (!markdown || !markdown.trim() || maxChunks <= 0) return [];
  const blocks: Block[] = [];
  for (const b of toBlocks(markdown, title)) {
    if (b.text.length <= MAX) blocks.push(b);
    else for (const piece of hardSplit(b.text, TARGET)) blocks.push({ text: piece, heading: b.heading });
  }

  const chunks: Chunk[] = [];
  let cur = '';
  let curHeading = blocks[0]?.heading ?? title;
  let curHasNew = false; // does `cur` contain anything beyond the overlap?

  const emit = () => {
    if (!cur.trim() || !curHasNew) return;
    chunks.push({ idx: chunks.length, text: cur.trim(), heading: curHeading });
    cur = tail(cur, OVERLAP);
    curHasNew = false;
  };

  for (const b of blocks) {
    if (chunks.length >= maxChunks) break;
    const joined = cur ? `${cur}\n\n${b.text}` : b.text;
    if (joined.length > MAX && curHasNew) {
      emit();
      if (chunks.length >= maxChunks) break;
      curHeading = b.heading;
      cur = cur ? `${cur}\n\n${b.text}` : b.text;
      if (cur.length > MAX) cur = b.text; // overlap would overflow; drop it
    } else {
      if (!curHasNew) curHeading = b.heading;
      cur = joined;
    }
    curHasNew = true;
    if (cur.length >= TARGET) emit();
  }
  if (chunks.length < maxChunks) emit();
  return chunks.slice(0, maxChunks);
}

/** Text sent to the embedder for a chunk. */
export function embedText(title: string, chunk: Chunk): string {
  return `${title}\n${chunk.heading && chunk.heading !== title ? chunk.heading + '\n' : ''}${chunk.text}`.slice(0, 2000);
}
