import { escapeHtml } from './email-content.ts';
import {
  EMAIL_COLOURS,
  EMAIL_FONTS,
  renderServiceEmail,
} from './email-layout.ts';

export type LetterTemplateInput = {
  body: string;
  subject: string;
  isReply: boolean;
  attachmentsRemoved: boolean;
  stopUrl: string;
  reportUrl: string;
};

export function renderLetterEmail(input: LetterTemplateInput) {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 22px;font-family:${EMAIL_FONTS.letter};font-size:18px;line-height:1.75;color:${EMAIL_COLOURS.foreground};white-space:pre-wrap">${escapeHtml(paragraph)}</p>`)
    .join('');
  const attachmentNote = input.attachmentsRemoved
    ? `<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid ${EMAIL_COLOURS.border};font-family:${EMAIL_FONTS.interface};font-size:12px;line-height:1.6;color:${EMAIL_COLOURS.muted}">Attachments were removed before delivery. Here, only the words travel.</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${EMAIL_COLOURS.background};color:${EMAIL_COLOURS.foreground}">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.body.slice(0, 120))}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLOURS.background}">
      <tr><td align="center" style="padding:48px 24px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px">
          <tr><td style="padding:0 0 34px;font-family:${EMAIL_FONTS.interface}">
            <span style="font-family:${EMAIL_FONTS.interface};font-size:16px;font-weight:700;line-height:1.2;letter-spacing:.02em;color:${EMAIL_COLOURS.foreground}">One Reader</span>
            <span style="float:right;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${EMAIL_COLOURS.muted}">${input.isReply ? 'A reply' : 'A letter for you'}</span>
          </td></tr>
          <tr><td>${paragraphs}${attachmentNote}</td></tr>
          <tr><td style="padding:42px 0 0;font-family:${EMAIL_FONTS.interface};font-size:11px;line-height:1.7;color:${EMAIL_COLOURS.muted}">
            <p style="margin:0">Reply directly from this inbox. Both real addresses remain hidden. The private reply address closes 30 days after the last exchange.</p>
            <p style="margin:14px 0 0"><a href="${escapeHtml(input.stopUrl)}" style="color:${EMAIL_COLOURS.accent};text-decoration:underline;text-underline-offset:3px">End this correspondence</a><span aria-hidden="true"> · </span><a href="${escapeHtml(input.reportUrl)}" style="color:${EMAIL_COLOURS.accent};text-decoration:underline;text-underline-offset:3px">Report this message</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    input.body,
    ...(input.attachmentsRemoved ? ['', 'Attachments were removed before delivery. Here, only the words travel.'] : []),
    '',
    'Reply directly from this inbox. Both real addresses remain hidden.',
    '',
    `End this correspondence: ${input.stopUrl}`,
    `Report this message: ${input.reportUrl}`,
  ].join('\n');

  return { html, text };
}

export function renderAttachmentNotice() {
  const subject = 'Your letter travelled without its attachments';
  return {
    subject,
    ...renderServiceEmail({
      preheader: 'The text was accepted; files were removed.',
      heading: 'Here, only the words travel.',
      paragraphs: ['Your text was accepted. Images and files were removed before delivery and were not shared with the other reader.'],
    }),
  };
}
