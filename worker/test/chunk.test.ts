import { describe, expect, it } from 'vitest';
import { chunkMarkdown, embedText, MAX } from '../src/chunk';

const para = (n: number, w = 'ghost') => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

describe('chunkMarkdown', () => {
  it('returns [] for empty input', () => {
    expect(chunkMarkdown('', 't')).toEqual([]);
    expect(chunkMarkdown('   \n\n', 't')).toEqual([]);
  });

  it('keeps a short doc as one chunk with its heading', () => {
    const c = chunkMarkdown('# Hello\n\nA short page about ghosts.', 'Title');
    expect(c).toHaveLength(1);
    expect(c[0].heading).toBe('Hello');
    expect(c[0].text).toContain('short page');
  });

  it('never exceeds MAX and respects maxChunks', () => {
    const md = Array.from({ length: 60 }, (_, i) => `## Section ${i}\n\n${para(60, 's' + i + '_')}`).join('\n\n');
    const c = chunkMarkdown(md, 'T', 5);
    expect(c.length).toBe(5);
    for (const ch of c) expect(ch.text.length).toBeLessThanOrEqual(MAX + 2);
    expect(c.map(x => x.idx)).toEqual([0, 1, 2, 3, 4]);
  });

  it('overlaps consecutive chunks', () => {
    const md = Array.from({ length: 12 }, (_, i) => para(40, `p${i}w`)).join('\n\n');
    const c = chunkMarkdown(md, 'T', 8);
    expect(c.length).toBeGreaterThan(1);
    const tailWords = c[0].text.split(' ').slice(-3).join(' ');
    expect(c[1].text).toContain(tailWords);
  });

  it('does not split a fenced code block that fits', () => {
    const code = '```js\n' + Array.from({ length: 20 }, (_, i) => `const a${i} = ${i};`).join('\n') + '\n```';
    const md = `${para(100)}\n\n${code}\n\n${para(100, 'z')}`;
    const c = chunkMarkdown(md, 'T', 8);
    const withFence = c.filter(x => x.text.includes('```js'));
    expect(withFence.length).toBeGreaterThan(0);
    expect(withFence.some(x => x.text.includes('const a19 = 19;'))).toBe(true);
  });

  it('hard-splits a giant paragraph', () => {
    const c = chunkMarkdown(para(2000), 'T', 8);
    expect(c.length).toBe(8);
    for (const ch of c) expect(ch.text.length).toBeLessThanOrEqual(MAX + 2);
  });

  it('embedText prefixes title and heading', () => {
    const [c] = chunkMarkdown('# Sub\n\nbody text', 'Page');
    expect(embedText('Page', c)).toMatch(/^Page\nSub\n/);
  });
});
