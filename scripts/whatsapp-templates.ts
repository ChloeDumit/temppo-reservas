/**
 * The WhatsApp templates Meta has to approve before anything can be sent.
 *
 *   npm run wa:templates              prints each one, to paste by hand
 *   npm run wa:templates -- --create  submits the missing ones to Meta
 *   npm run wa:templates -- --status  shows what Meta approved or rejected
 *
 * --create and --status need WHATSAPP_TOKEN and WHATSAPP_WABA_ID (the
 * WhatsApp Business Account ID, in WhatsApp Manager next to the account
 * name). Add --en to include the English versions.
 */
import "dotenv/config";
import {
  WHATSAPP_FOOTER,
  WHATSAPP_TEMPLATE_KEYS,
  WHATSAPP_TEMPLATES,
} from "../src/lib/notifications/whatsapp-templates";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";
const args = new Set(process.argv.slice(2));
const languages = args.has("--en") ? (["es", "en"] as const) : (["es"] as const);

/** Sample values Meta asks for, so its reviewers can read the message. */
const EXAMPLES: Record<string, string> = {
  "first name": "Sofía",
  service: "Kapping gel",
  studio: "Lu Nails Studio",
  "day and time": "jueves 14 de noviembre, 15:30",
  "manage link": "https://beauty.temppo.uy/m/abc123",
  "booking link": "https://beauty.temppo.uy/b/lu-nails-studio",
  deposit: "$ 300",
  professional: "Lucía",
};

function graph(path: string, init?: RequestInit) {
  const token = process.env.WHATSAPP_TOKEN;
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!token || !waba) {
    console.error("Faltan WHATSAPP_TOKEN y/o WHATSAPP_WABA_ID en .env");
    process.exit(1);
  }
  return fetch(`https://graph.facebook.com/${API_VERSION}/${waba}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  }).then(async (res) => ({ ok: res.ok, body: (await res.json().catch(() => ({}))) as Record<string, unknown> }));
}

type Existing = { name: string; language: string; status: string; rejected_reason?: string };

async function existing(): Promise<Existing[]> {
  const res = await graph("/message_templates?fields=name,language,status,rejected_reason&limit=200");
  if (!res.ok) {
    console.error("Meta respondió:", JSON.stringify(res.body));
    process.exit(1);
  }
  return (res.body.data as Existing[]) ?? [];
}

function print() {
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    const tpl = WHATSAPP_TEMPLATES[key];
    for (const lang of languages) {
      console.log(`\n── ${key} [${lang}] · Utility ──`);
      console.log(tpl.body[lang]);
      console.log(`Pie: ${WHATSAPP_FOOTER[lang]}`);
      console.log(`Ejemplos: ${tpl.params.map((p, i) => `{{${i + 1}}} ${EXAMPLES[p]}`).join(" · ")}`);
    }
  }
}

async function create() {
  const have = await existing();
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    const tpl = WHATSAPP_TEMPLATES[key];
    for (const lang of languages) {
      if (have.some((t) => t.name === key && t.language === lang)) {
        console.log(`= ${key} [${lang}] ya existe`);
        continue;
      }
      const res = await graph("/message_templates", {
        method: "POST",
        body: JSON.stringify({
          name: key,
          language: lang,
          category: "UTILITY",
          components: [
            { type: "BODY", text: tpl.body[lang], example: { body_text: [tpl.params.map((p) => EXAMPLES[p])] } },
            { type: "FOOTER", text: WHATSAPP_FOOTER[lang] },
          ],
        }),
      });
      console.log(res.ok ? `+ ${key} [${lang}] enviada (${res.body.status})` : `✗ ${key} [${lang}]: ${JSON.stringify(res.body)}`);
    }
  }
}

async function status() {
  const have = await existing();
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    for (const lang of languages) {
      const t = have.find((x) => x.name === key && x.language === lang);
      const reason = t?.rejected_reason && t.rejected_reason !== "NONE" ? ` (${t.rejected_reason})` : "";
      console.log(`${(t?.status ?? "NO CREADA").padEnd(10)} ${key} [${lang}]${reason}`);
    }
  }
}

(args.has("--create") ? create() : args.has("--status") ? status() : Promise.resolve(print())).catch((error) => {
  console.error(error);
  process.exit(1);
});
