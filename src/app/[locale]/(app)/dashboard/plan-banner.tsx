import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { beautyPlan, daysLeft, dueDate, onAutoDebit } from "@/lib/billing/beauty";
import { cn } from "@/lib/cn";

/**
 * The owner's plan at a glance on the home panel — «Prueba gratis · quedan
 * 5 días» — with the way into Mi plan. Louder as the date gets close.
 */
export async function PlanBanner({ studioId, timezone, locale }: { studioId: string; timezone: string; locale: string }) {
  const studio = await db.studio.findUnique({
    where: { id: studioId },
    select: { plan: true, nextPlan: true, trialEndsAt: true, suspendedAt: true, subscription: true },
  });
  if (!studio) return null;
  const trial = studio.plan === "TRIAL";
  const dueAt = dueDate(studio, studio.subscription);
  const left = dueAt ? daysLeft(dueAt, new Date()) : null;
  const auto = onAutoDebit(studio.subscription);
  const urgent = !auto && left !== null && left <= 3;

  const name = trial ? "Prueba gratis" : `Plan ${beautyPlan(studio.plan as Exclude<typeof studio.plan, "TRIAL">).name}`;
  const status =
    auto ? "débito automático"
    : left === null ? null
    : left < 0 ? (trial ? "tu prueba terminó" : "pago vencido")
    : left === 0 ? (trial ? "tu prueba termina hoy" : "vence hoy")
    : trial ? `quedan ${left} ${left === 1 ? "día" : "días"}`
    : `pagado hasta el ${formatDate(dueAt!, timezone, locale)}`;

  return (
    <Link
      href="/plan"
      className={cn(
        "mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-4 py-3 text-sm",
        urgent ? "bg-caution-soft text-caution" : "bg-sunken text-ink-soft",
      )}
    >
      <span>
        <strong className={urgent ? "" : "text-ink"}>{name}</strong>
        {status && ` · ${status}`}
      </span>
      <span className="shrink-0 font-medium">{urgent ? "Pagar →" : "Mi plan →"}</span>
    </Link>
  );
}
