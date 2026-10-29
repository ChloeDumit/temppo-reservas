/**
 * The WhatsApp templates Meta has to approve before anything can be sent.
 *
 *   npm run wa:templates              prints each one, to paste by hand
 *   npm run wa:templates -- --create  submits the missing ones to Meta
 *   npm run wa:templates -- --status  shows what Meta approved or rejected
 *   npm run wa:templates -- --sync    rewrites approved or rejected ones in
 *                                     Meta to match the wording here (Meta
 *                                     allows one edit a day per template)
 *
 * --create and --status need WHATSAPP_TOKEN and WHATSAPP_WABA_ID (the
 * WhatsApp Business Account ID, in WhatsApp Manager next to the account
 * name). Add --en to include the English versions.
 */
import "dotenv/config";
import {
  WHATSAPP_TEMPLATE_KEYS,
  WHATSAPP_TEMPLATES,
  metaTemplateName,
  type WhatsAppTemplateKey,
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
  "studio contact": "wa.me/59899123456",
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

type Existing = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  rejected_reason?: string;
  components?: { type: string; text?: string }[];
};

/** What Meta stores for a template: the body and its sample values, nothing else. */
function components(key: WhatsAppTemplateKey, lang: "es" | "en") {
  const tpl = WHATSAPP_TEMPLATES[key];
  return [{ type: "BODY", text: tpl.body[lang], example: { body_text: [tpl.params.map((p) => EXAMPLES[p])] } }];
}

async function existing(): Promise<Existing[]> {
  const res = await graph("/message_templates?fields=id,name,language,status,category,rejected_reason,components&limit=200");
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
      console.log(`Ejemplos: ${tpl.params.map((p, i) => `{{${i + 1}}} ${EXAMPLES[p]}`).join(" · ")}`);
    }
  }
}

async function create() {
  const have = await existing();
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    const tpl = WHATSAPP_TEMPLATES[key];
    for (const lang of languages) {
      const name = metaTemplateName(key);
      if (have.some((t) => t.name === name && t.language === lang)) {
        console.log(`= ${key} [${lang}] ya existe`);
        continue;
      }
      const res = await graph("/message_templates", {
        method: "POST",
        body: JSON.stringify({
          name,
          language: lang,
          category: "UTILITY",
          components: components(key, lang),
        }),
      });
      console.log(res.ok ? `+ ${key} [${lang}] enviada (${res.body.status})` : `✗ ${key} [${lang}]: ${JSON.stringify(res.body)}`);
    }
  }
}

/**
 * Brings templates already in Meta in line with the code. Only approved or
 * rejected ones can be edited; one still in review is left for a later run.
 * Each edit goes back to Meta's review: check it with --status.
 */
async function sync() {
  const token = process.env.WHATSAPP_TOKEN;
  const have = await existing();
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    for (const lang of languages) {
      const t = have.find((x) => x.name === metaTemplateName(key) && x.language === lang);
      if (!t) {
        console.log(`· ${key} [${lang}] no existe: usá --create`);
        continue;
      }
      const body = t.components?.find((c) => c.type === "BODY")?.text;
      const extra = t.components?.some((c) => c.type !== "BODY");
      if (body === WHATSAPP_TEMPLATES[key].body[lang] && !extra) {
        console.log(`= ${key} [${lang}] ya está al día`);
        continue;
      }
      if (t.category && t.category !== "UTILITY") {
        console.log(`✗ ${key} [${lang}] Meta la pasó a ${t.category}: no se edita, hay que darle un nombre nuevo (metaName)`);
        continue;
      }
      if (!["APPROVED", "REJECTED", "PAUSED"].includes(t.status)) {
        console.log(`… ${key} [${lang}] está ${t.status}: se puede editar cuando Meta termine de revisarla`);
        continue;
      }
      const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${t.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ components: components(key, lang) }),
      }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }));
      console.log(res.ok ? `~ ${key} [${lang}] editada` : `✗ ${key} [${lang}]: ${JSON.stringify(res.body)}`);
    }
  }
}

async function status() {
  const have = await existing();
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    for (const lang of languages) {
      const t = have.find((x) => x.name === metaTemplateName(key) && x.language === lang);
      const reason = t?.rejected_reason && t.rejected_reason !== "NONE" ? ` (${t.rejected_reason})` : "";
      const category = t?.category ?? "";
      const warn = t && category !== "UTILITY" ? "  ⚠ no es UTILITY: se cobra como marketing" : "";
      console.log(`${(t?.status ?? "NO CREADA").padEnd(10)} ${category.padEnd(10)} ${metaTemplateName(key)} [${lang}]${reason}${warn}`);
    }
  }
}

(args.has("--create")
  ? create()
  : args.has("--sync")
    ? sync()
    : args.has("--status")
      ? status()
      : Promise.resolve(print())
).catch((error) => {
  console.error(error);
  process.exit(1);
});
