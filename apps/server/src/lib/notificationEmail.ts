/** Notification email markup — pure, see notificationEmail.test.ts. */

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

export function renderNotificationEmail(email: { title: string; body: string; path: string }, appUrl: string) {
    const url = `${appUrl.replace(/\/+$/, '')}${email.path}`;
    const html = `
      <div style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">
        <div style="max-width:560px;margin:0 auto;padding:28px 16px">
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px">
            <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25;color:#111827">${escapeHtml(email.title)}</h1>
            <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 20px">${escapeHtml(email.body)}</p>
            <a href="${escapeHtml(url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Deschide BCMS</a>
            <p style="font-size:12px;line-height:1.5;color:#94a3b8;margin:22px 0 0">Primești acest email pentru că ești membru al clubului în BCMS. Poți opri emailurile din Profil → Notificări.</p>
          </div>
        </div>
      </div>`;
    const text = `${email.title}\n\n${email.body}\n\nDeschide BCMS: ${url}\n\nPoți opri emailurile din Profil → Notificări.`;
    return { html, text };
}

