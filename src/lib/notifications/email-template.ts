import "server-only";

/**
 * Renders the HTML shell around a notification.
 *
 * The plain-text body stays the source of truth — it is what push
 * send, and what non-HTML mail clients fall back to. This wraps that same text
 * in a branded layout rather than asking eleven call sites to write markup.
 *
 * Email rendering is a decade behind the web, so: tables for layout, inline
 * styles only (Gmail strips <style> blocks), no flexbox or grid, explicit
 * colours everywhere, and images that degrade to alt text.
 */

export type EmailBranding = {
  studioName: string;
  /** Studio override, falling back to the TEMPPO brand orange. */
  accentColor: string;
  logoUrl: string | null;
  locale: string;
};

const BRAND_ORANGE = "#E07A5F";
const PAPER = "#FAF7F4";
const INK = "#1C1917";
const INK_SOFT = "#57534E";
const MUTED = "#8A827A";
const LINE = "#ECE5DD";

/*
  Declared on every text element rather than relying on inheritance: several
  clients (and most webmail preview panes) drop font-family from ancestors and
  fall back to a serif default, which turns the whole message into Times.
*/
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

/** Label for the primary button, by notification template. */
const CTA_LABELS: Record<string, { es: string; en: string }> = {
  magic_link: { es: "Entrar", en: "Sign in" },
  waitlist_offer: { es: "Confirmar mi lugar", en: "Claim my spot" },
  class_reminder: { es: "Ver mi clase", en: "View my class" },
  class_cancelled: { es: "Ver mi agenda", en: "View my schedule" },
  payment_approved: { es: "Ver mis clases", en: "View my classes" },
  payment_submitted: { es: "Ver el pago", en: "View the payment" },
  team_invite: { es: "Aceptar la invitación", en: "Accept the invitation" },
  student_invite: { es: "Entrar a mi estudio", en: "Open my studio" },
  welcome: { es: "Abrir mi estudio", en: "Open my studio" },
  lead_new: { es: "Ver el interesado", en: "View the lead" },
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pulls the first link out of the body so it can become a real button.
 *
 * A bare URL in an email reads as spam and is painful to tap on a phone; the
 * same link as a button is the single thing most of these messages want the
 * reader to do. The trailing colon and any surrounding whitespace go with it,
 * so the remaining sentence does not end mid-thought.
 */
function extractLink(body: string) {
  const match = body.match(/https?:\/\/\S+/);
  if (!match) return { text: body, link: null as string | null };

  const link = match[0].replace(/[.,;)]+$/, "");
  const text = body
    .replace(match[0], "")
    .replace(/[ \t]*:[ \t]*(\n|$)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, link };
}

/** Body text into paragraphs, preserving the blank-line breaks authors wrote. */
function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK_SOFT};">${escapeHtml(
          block,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

export function renderEmail({
  body,
  subject,
  template,
  branding,
  appUrl,
}: {
  body: string;
  subject: string;
  template: string;
  branding: EmailBranding;
  appUrl: string;
}) {
  const isEnglish = branding.locale === "en";
  const accent = branding.accentColor || BRAND_ORANGE;
  const { text, link } = extractLink(body);

  const ctaLabel =
    CTA_LABELS[template]?.[isEnglish ? "en" : "es"] ??
    (isEnglish ? "Open TEMPPO Reservas" : "Abrir TEMPPO Reservas");

  // A studio logo when there is one, otherwise the mascot from the app itself.
  const logo = branding.logoUrl || `${appUrl}/icon-192.png`;

  const button = link
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
        <tr>
          <td style="border-radius:999px;background:${accent};">
            <a href="${escapeHtml(link)}"
               style="display:inline-block;padding:14px 32px;font-family:${SANS};font-size:16px;
                      font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
              ${ctaLabel}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED};">
        ${isEnglish ? "Or copy this link:" : "O copiá este enlace:"}<br />
        <a href="${escapeHtml(link)}" style="color:${accent};word-break:break-all;">${escapeHtml(
          link,
        )}</a>
      </p>`
    : "";

  /*
    The preheader is the grey line an inbox shows next to the subject. Left
    unset, clients scrape whatever markup comes first — usually the alt text of
    the logo. The zero-width padding stops the rest of the body leaking in.
  */
  const preheader = escapeHtml(text.split("\n")[0]?.slice(0, 120) ?? "");

  return `<!doctype html>
<html lang="${isEnglish ? "en" : "es"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${SANS};">
<div style="display:none;font-size:1px;color:${PAPER};max-height:0;overflow:hidden;">
  ${preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${PAPER};padding:32px 16px;">
  <tr>
    <td align="center">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="max-width:520px;">

        <tr>
          <td style="padding:0 4px 20px;">
            <img src="${escapeHtml(logo)}" width="44" height="44" alt="${escapeHtml(
              branding.studioName,
            )}"
                 style="display:block;border:0;border-radius:12px;" />
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;border:1px solid ${LINE};border-radius:20px;padding:32px 28px;">
            <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:22px;line-height:1.3;
                       font-weight:600;color:${INK};">
              ${escapeHtml(subject)}
            </h1>
            ${paragraphs(text)}
            ${button}
          </td>
        </tr>

        <tr>
          <td style="padding:22px 8px 0;text-align:center;">
            <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;color:${MUTED};">
              ${escapeHtml(branding.studioName)}
            </p>
            <p style="margin:0;font-family:${SANS};font-size:12px;color:${MUTED};">
              ${isEnglish ? "Sent by" : "Enviado con"}
              <a href="${escapeHtml(appUrl)}" style="color:${accent};text-decoration:none;">
                TEMPPO Reservas</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
