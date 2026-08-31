import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { getJournalEntries, getJournalSlug, type JournalEntry } from '../../lib/journal';

export async function getStaticPaths() {
  const entries = await getJournalEntries();
  const uniqueEntries = [...new Map(entries.map((entry) => [getJournalSlug(entry), entry])).values()];
  return uniqueEntries.map((entry) => ({
    params: { slug: getJournalSlug(entry) },
    props: { entry },
  }));
}

const escapeXml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const wrap = (value: string, maxCharacters: number) => {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
};

const balanceTitle = (value: string, maxCharacters: number) => {
  const words = value.split(/\s+/);
  if (words.length < 4) return wrap(value, maxCharacters);

  let best: string[] | undefined;
  let bestDifference = Number.POSITIVE_INFINITY;
  for (let split = 2; split < words.length - 1; split += 1) {
    const lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
    if (lines.some((line) => line.length > maxCharacters)) continue;
    const difference = Math.abs(lines[0].length - lines[1].length);
    if (difference < bestDifference) {
      best = lines;
      bestDifference = difference;
    }
  }

  return best ?? wrap(value, maxCharacters);
};

export const GET: APIRoute = async ({ props }) => {
  const entry = props.entry as JournalEntry;
  const titleLines = balanceTitle(entry.data.title, 24);
  const titleFontSize = titleLines.length > 2 ? 62 : 78;
  const titleLineHeight = Math.round(titleFontSize * 1.16);
  const titleStart = titleLines.length === 1 ? 330 : titleLines.length === 2 ? 260 : 214;
  const titleMarkup = titleLines
    .map((line, index) => `<text x="96" y="${titleStart + index * titleLineHeight}" class="title">${escapeXml(line)}</text>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <path d="M96 126H1104" stroke="#e4e1d8" stroke-width="1"/>
  <text x="96" y="82" class="brand"><tspan>One Reader</tspan><tspan dx="10" class="section">Journal</tspan></text>
  ${titleMarkup}
  <path d="M96 558H1104" stroke="#e4e1d8" stroke-width="1"/>
  <text x="96" y="598" class="footer">onereader.co/journal</text>
  <style>
    .brand { fill:#1a1a18; font: 700 32px "IBM Plex Mono", "SFMono-Regular", "SF Mono", "DejaVu Sans Mono", monospace; letter-spacing:.64px; }
    .section { fill:#26344e; font: 400 18px "IBM Plex Mono", "SFMono-Regular", "SF Mono", "DejaVu Sans Mono", monospace; letter-spacing:1.08px; text-transform:uppercase; }
    .title { fill:#1a1a18; font: 400 ${titleFontSize}px "IBM Plex Mono", "SFMono-Regular", "SF Mono", "DejaVu Sans Mono", monospace; letter-spacing:-.5px; }
    .footer { fill:#4a4a45; font: 400 15px "IBM Plex Mono", "SFMono-Regular", "SF Mono", "DejaVu Sans Mono", monospace; letter-spacing:.3px; }
  </style>
</svg>`;

  const png = await sharp(Buffer.from(svg))
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
