// Le récapitulatif, par courriel.
//
// Le récap partait jusqu'ici en notification, et en notification seulement.
// C'était le supposer reçu : une notification demande un appareil enregistré,
// une autorisation accordée dans le bon navigateur, et un système qui veut
// bien la montrer. Sur un iPhone, il faut en plus que l'application ait été
// ajoutée à l'écran d'accueil. Autant de conditions dont aucune n'est visible
// depuis Henri — d'où un récap qui « ne marche pas » sans que rien n'ait
// échoué : il n'y avait tout simplement personne à qui l'envoyer.
//
// Le courriel, lui, arrive toujours. C'est le même expéditeur et le même
// gabarit que les autres courriels de l'Office (`src/lib/brevo.ts`) : SPF et
// DKIM sont déjà posés sur `mail.tagot.fr`, il n'y a rien de plus à
// authentifier.
//
// La clé Brevo n'est pas dans le code : elle vit dans Secret Manager, et le
// déploiement la relie à la fonction (voir `.github/workflows/deploy-functions.yml`).

const SENDER = { name: "Grégoire TAGOT", email: "noreply@mail.tagot.fr" };
const BASE_URL = "https://henri.tagot.fr";

/** Un titre de tâche vient de l'utilisateur : il ne s'insère jamais brut. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Envoie un courriel via Brevo.
 * Lève si l'API refuse : l'appelant décide quoi en faire.
 */
async function sendBrevoEmail(apiKey, to, subject, html, text) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) throw new Error(`brevo ${res.status}: ${await res.text()}`);
}

/**
 * Le récapitulatif du soir ou du matin.
 *
 * `slot` vaut "soir" (ce qu'il reste aujourd'hui) ou "matin" (ce que la veille
 * a laissé). `titles` est la liste complète : le courriel n'a pas la contrainte
 * de place d'une notification, il les porte donc toutes.
 */
async function sendRecapEmail(apiKey, { to, slot, titles }) {
  const n = titles.length;
  const plural = n > 1 ? "s" : "";
  const heading = slot === "soir"
    ? `${n} tâche${plural} encore à faire aujourd'hui`
    : `${n} tâche${plural} d'hier non traitée${plural}`;
  const intro = slot === "soir"
    ? "Voici ce qui reste ouvert dans Ma journée à l'heure où la journée s'achève."
    : "Voici ce que la journée d'hier a laissé ouvert.";

  const rows = titles
    .map((title) => `<tr><td style="padding:9px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(title)}</td></tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:40px 20px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
<tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f59e0b;height:4px;font-size:0;"> </td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:44px 52px 40px;">
    <img src="https://i.imgur.com/MKLZSiT.jpeg" alt="Henri" width="80" style="display:block;margin-bottom:36px;height:auto;" />
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#f59e0b;letter-spacing:0.1em;text-transform:uppercase;">Récapitulatif du ${slot}</p>
    <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.8;">${intro}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">${rows}</table>
    <table cellpadding="0" cellspacing="0">
      <tr><td style="background:#111827;border-radius:8px;">
        <a href="${BASE_URL}/my-day" style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Ouvrir Ma journée &rarr;</a>
      </td></tr>
    </table>
  </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#fafafa;border-top:1px solid #f3f4f6;padding:24px 52px;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.7;">
        Grégoire TAGOT · 2 rue Dante, 75005 Paris · gregoire@tagot.fr<br>
        Pour ne plus recevoir ce récapitulatif : Préférences &rarr; Rappels, dans Henri.
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    `Henri — récapitulatif du ${slot}`,
    "",
    heading,
    "",
    ...titles.map((title) => `· ${title}`),
    "",
    `${BASE_URL}/my-day`,
    "",
    "Pour ne plus recevoir ce récapitulatif : Préférences > Rappels, dans Henri.",
  ].join("\n");

  await sendBrevoEmail(apiKey, to, `Henri — ${heading}`, html, text);
}

module.exports = { sendRecapEmail, escapeHtml };
