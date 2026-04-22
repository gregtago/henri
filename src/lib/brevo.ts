const BREVO_API_KEY = process.env.BREVO_API_KEY!;
const SENDER = { name: "Grégoire TAGOT", email: "noreply@mail.tagot.fr" };

async function sendBrevoEmail(to: string, subject: string, html: string, text: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: SENDER, to: [{ email: to, name: to || to }], subject, htmlContent: html, textContent: text }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function sendResetEmail(email: string, link: string) {
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:40px 20px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
<tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f59e0b;height:4px;font-size:0;"> </td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:44px 52px 40px;">
    <img src="https://i.imgur.com/MKLZSiT.jpeg" alt="Henri" width="80" style="display:block;margin-bottom:36px;height:auto;" />
    <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">Réinitialisation de votre mot de passe</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.8;">Cliquez ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong style="color:#111827;">1 heure</strong>.</p>
    <p style="margin:0 0 36px;font-size:15px;color:#4b5563;line-height:1.8;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    <table cellpadding="0" cellspacing="0">
      <tr><td style="background:#111827;border-radius:8px;">
        <a href="${link}" style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Réinitialiser mon mot de passe &rarr;</a>
      </td></tr>
    </table>
    <p style="margin:36px 0 0;font-size:11px;color:#9ca3af;line-height:1.8;">
      Si le bouton ne fonctionne pas, copiez ce lien :<br>
      <span style="color:#374151;word-break:break-all;">${link}</span>
    </p>
  </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#fafafa;border-top:1px solid #f3f4f6;padding:24px 52px;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">Grégoire TAGOT · 2 rue Dante, 75005 Paris · gregoire@tagot.fr</p>
    </td></tr>
  </table>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  const text = `Réinitialisation mot de passe Henri\n\n${link}\n\nGrégoire TAGOT`;
  await sendBrevoEmail(email, "Réinitialisation de votre mot de passe Henri", html, text);
}
