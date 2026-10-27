import { getTranslations } from "next-intl/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addMonths } from "@/lib/dates";
import { WA_AUTO_LIVE } from "@/lib/brand/pricing";
import { WHATSAPP_TEMPLATE_KEYS, WHATSAPP_TEMPLATES } from "@/lib/notifications/whatsapp-templates";
import { setWhatsAppAutoAction } from "./actions";

type WaStudio = {
  locale: string;
  timezone: string;
  waMode: string;
  waMonthlyQuota: number;
  waSentThisPeriod: number;
  waPeriodStart: Date | null;
};

/**
 * Automatic WhatsApp for an appointment business: the same messages its
 * clients get by email, sent from the platform's number with the studio's
 * name in each, within the plan's monthly quota.
 */
export async function WhatsAppCard({ studio }: { studio: WaStudio }) {
  const t = await getTranslations("settings");
  const lang = studio.locale === "en" ? "en" : "es";
  const on = studio.waMode === "CLOUD";
  const inPlan = studio.waMonthlyQuota > 0;

  // A period that ran out shows as unused: the next send starts a new one.
  const periodEnd = studio.waPeriodStart ? addMonths(studio.waPeriodStart, 1) : null;
  const current = periodEnd && periodEnd > new Date();
  const used = current ? studio.waSentThisPeriod : 0;
  const pct = inPlan ? Math.min(100, Math.round((used / studio.waMonthlyQuota) * 100)) : 0;
  const resets = current
    ? new Intl.DateTimeFormat(studio.locale, { day: "numeric", month: "long", timeZone: studio.timezone }).format(periodEnd)
    : null;

  return (
    <Card id="whatsapp">
      <CardHeader title={t("waTitle")} />
      <CardBody className="space-y-4">
        {!inPlan ? (
          <>
            <Badge>{t(WA_AUTO_LIVE ? "waNotInPlan" : "waSoon")}</Badge>
            <p className="text-sm text-ink-soft">{t("waPitch")}</p>
            <p className="text-xs text-muted">{t("waManualHint")}</p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone={on ? "positive" : "neutral"}>{t(on ? "waOn" : "waOff")}</Badge>
              <form action={setWhatsAppAutoAction}>
                <input type="hidden" name="on" value={on ? "0" : "1"} />
                <Button type="submit" variant={on ? "ghost" : "primary"} size="sm">
                  {t(on ? "waTurnOff" : "waTurnOn")}
                </Button>
              </form>
            </div>

            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink-soft">{t("waUsage", { used, quota: studio.waMonthlyQuota })}</span>
                {resets && <span className="text-xs text-muted">{t("waResets", { date: resets })}</span>}
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                <div className={`h-full rounded-full ${pct >= 90 ? "bg-critical" : "bg-accent"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted">{t("waQuotaHint")}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-ink">{t("waWhich")}</p>
              <ul className="mt-2 grid gap-1.5 text-sm text-ink-soft sm:grid-cols-2">
                {WHATSAPP_TEMPLATE_KEYS.map((key) => (
                  <li key={key} className="flex gap-2">
                    <span className={on ? "text-accent" : "text-muted"} aria-hidden>
                      ✓
                    </span>
                    {WHATSAPP_TEMPLATES[key].label[lang]}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{t("waStopHint")}</p>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
