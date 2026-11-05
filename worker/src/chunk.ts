/**
 * Markdown-aware chunking with heading splits, blank lines, target/max sizes, and overlap.
 * Pure function (no Cloudflare globals) for testability in Node.
 */

export interface Chunk {
  idx: number;
  text: string;
  heading?: string;
}

/**
 * Split markdown into chunks.
 * - Target: ~900 chars
 * - Max: 1200 chars
 * - Overlap: 120 chars between consecutive chunks
 * - Respects headings and blank lines as split points
 * - Keeps at most maxChunks chunks (first ones)
 */
export function chunkMarkdown(
  markdown: string,
  title: string,
  maxChunks: number = 8
): Chunk[] {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  const TARGET = 900;
  const MAX = 1200;
  const OVERLAP = 120;

  // Split by headings and blank lines
  const lines = markdown.split('\n');
  const segments: string[] = [];
  let currentSegment = '';

  for (const line of lines) {
    const isHeading = line.startsWith('#');
    const isBlank = line.trim().length === 0;

    if ((isHeading || isBlank) && currentSegment.trim().length > 0) {
      segments.push(currentSegment.trim());
      currentSegment = '';
      if (isHeading) {
        currentSegment = line;
      }
    } else {
      if (currentSegment) {
        currentSegment += '\n';
      }
      currentSegment += line;
    }
  }

  if (currentSegment.trim().length > 0) {
    segments.push(currentSegment.trim());
  }

  // Pack segments into chunks
  const chunks: Chunk[] = [];
  let chunkText = '';
  let chunkHeading = title;

  for (const segment of segments) {
    // Extract heading if this segment starts with one
    const headingMatch = segment.match(/^(#{1,6})\s+(.+?)(?:\n|$)/);
    if (headingMatch) {
      chunkHeading = headingMatch[2];
    }

    const segmentLength = segment.length;

    // If adding this segment would exceed MAX, flush current chunk
    if (chunkText.length + segmentLength > MAX) {
      if (chunkText.length > 0) {
        chunks.push({
          idx: chunks.length,
          text: `"${title}"\n${chunkHeading}\n${chunkText}`.trim(),
          heading: chunkHeading
        });

        // Apply overlap: keep last OVERLAP chars of chunkText
        chunkText = chunkText.length > OVERLAP ? chunkText.slice(-OVERLAP) : '';
      }
    }

    chunkText += (chunkText ? '\n' : '') + segment;

    // If we're over TARGET and have a reasonable chunk, consider flushing
    if (chunkText.length > TARGET) {
      // Look for last blank line or heading boundary to split cleanly
      const lastNewline = chunkText.lastIndexOf('\n');
      if (lastNewline > TARGET / 2) {
        const beforeNewline = chunkText.slice(0, lastNewline);
        chunks.push({
          idx: chunks.length,
          text: `"${title}"\n${chunkHeading}\n${beforeNewline}`.trim(),
          heading: chunkHeading
        });

        const afterNewline = chunkText.slice(lastNewline + 1);
        chunkText = afterNewline.length > OVERLAP ? afterNewline.slice(-OVERLAP) + '\n' + afterNewline : afterNewline;
      }
    }

    if (chunks.length >= maxChunks) {
      break;
    }
  }

  // Flush remaining
  if (chunkText.trim().length > 0) {
    chunks.push({
      idx: chunks.length,
      text: `"${title}"\n${chunkHeading}\n${chunkText}`.trim(),
      heading: chunkHeading
    });
  }

  return chunks.slice(0, maxChunks);
}
