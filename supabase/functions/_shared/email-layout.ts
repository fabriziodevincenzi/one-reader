import { escapeHtml } from './email-content.ts';

export type EmailAction = {
  label: string;
  href: string;
};

export type EmailDetail = {
  label: string;
  value: string;
};

export type ServiceEmailContent = {
  preheader: string;
  heading?: string;
  paragraphs: string[];
  details?: EmailDetail[];
  action?: EmailAction;
  secondary?: EmailAction;
  footer?: string;
};

export type RenderedEmailBody = {
  html: string;
  text: string;
};

export const EMAIL_COLOURS = {
  background: '#faf7f0',
  foreground: '#211f1b',
  muted: '#6c665d',
  border: '#d8d0c4',
  accent: '#9b5943',
} as const;

export const EMAIL_FONTS = {
  interface: `-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`,
  letter: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`,
} as const;

export function renderServiceEmail(content: ServiceEmailContent): RenderedEmailBody {
  const heading = content.heading
    ? `<h1 style="margin:0 0 24px;font-family:${EMAIL_FONTS.interface};font-size:24px;font-weight:500;line-height:1.3;letter-spacing:-.015em;color:${EMAIL_COLOURS.foreground}">${escapeHtml(content.heading)}</h1>`
    : '';
  const paragraphs = content.paragraphs
    .map((paragraph) => `<p style="margin:0 0 18px;font-family:${EMAIL_FONTS.interface};font-size:16px;line-height:1.65;color:${EMAIL_COLOURS.foreground}">${escapeHtml(paragraph)}</p>`)
    .join('');
  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0 0;border-top:1px solid ${EMAIL_COLOURS.border}">${content.details.map((detail) => `<tr><td style="padding:12px 16px 12px 0;border-bottom:1px solid ${EMAIL_COLOURS.border};font-family:${EMAIL_FONTS.interface};font-size:13px;line-height:1.5;color:${EMAIL_COLOURS.muted}">${escapeHtml(detail.label)}</td><td align="right" style="padding:12px 0;border-bottom:1px solid ${EMAIL_COLOURS.border};font-family:${EMAIL_FONTS.interface};font-size:13px;line-height:1.5;color:${EMAIL_COLOURS.foreground}">${escapeHtml(detail.value)}</td></tr>`).join('')}</table>`
    : '';
  const action = content.action
    ? `<p style="margin:30px 0 0"><a href="${escapeHtml(content.action.href)}" style="display:inline-block;background:${EMAIL_COLOURS.foreground};color:${EMAIL_COLOURS.background};padding:12px 17px;border-radius:2px;font-family:${EMAIL_FONTS.interface};font-size:14px;font-weight:500;line-height:1.2;text-decoration:none">${escapeHtml(content.action.label)}</a></p>`
    : '';
  const secondary = content.secondary
    ? `<p style="margin:18px 0 0;font-family:${EMAIL_FONTS.interface};font-size:13px;line-height:1.6"><a href="${escapeHtml(content.secondary.href)}" style="color:${EMAIL_COLOURS.accent};text-decoration:underline;text-underline-offset:3px">${escapeHtml(content.secondary.label)}</a></p>`
    : '';
  const footer = content.footer ?? 'A service message from One Reader. No tracking pixel.';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${EMAIL_COLOURS.background};color:${EMAIL_COLOURS.foreground}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLOURS.background}">
      <tr><td align="center" style="padding:42px 22px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
          <tr><td style="padding:0 0 34px;font-family:${EMAIL_FONTS.letter};font-size:18px;line-height:1.4;color:${EMAIL_COLOURS.foreground}">One Reader</td></tr>
          <tr><td>${heading}${paragraphs}${details}${action}${secondary}</td></tr>
          <tr><td style="padding:38px 0 0;font-family:${EMAIL_FONTS.interface};font-size:12px;line-height:1.6;color:${EMAIL_COLOURS.muted}">${escapeHtml(footer)}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    ...(content.heading ? [content.heading, ''] : []),
    ...content.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(content.details?.flatMap((detail) => [`${detail.label}: ${detail.value}`]) ?? []),
    ...(content.details?.length ? [''] : []),
    ...(content.action ? [`${content.action.label}: ${content.action.href}`, ''] : []),
    ...(content.secondary ? [`${content.secondary.label}: ${content.secondary.href}`, ''] : []),
    `One Reader — ${footer}`,
  ].join('\n').trim();

  return { html, text };
}
