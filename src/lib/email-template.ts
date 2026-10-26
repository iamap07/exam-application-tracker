// Pure: safe email rendering.
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
export const cleanSubject = (s: string) => s.replace(/[\r\n]+/g, " ").trim().slice(0, 150);

export function renderEmail(p: { subject: string; message: string; name: string; appUrl: string }) {
  const subject = cleanSubject(p.subject);
  const link = /^https?:\/\//.test(p.appUrl) ? p.appUrl : "";
  const text = `Hello ${p.name},\n\n${p.message}\n\n${link ? `Open the tracker: ${link}\n\n` : ""}This is an automated message from Exam Application Tracker.`;
  const paras = p.message.split(/\n{1,}/).map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;max-width:560px"><p style="margin:0 0 12px">Hello ${escapeHtml(p.name)},</p>${paras}${link ? `<p style="margin:16px 0"><a href="${escapeHtml(link)}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the tracker</a></p>` : ""}<p style="font-size:12px;color:#64748b">This is an automated message from Exam Application Tracker.</p></div>`;
  return { subject, text, html };
}
