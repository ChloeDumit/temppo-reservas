import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { isBirthdayToday } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { List, ListRow } from "@/components/ui/list";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { StudentForm } from "./student-form";

const EMPTY = {
  name: "",
  email: "",
  documentId: "",
  phone: "",
  birthDate: "",
  healthNotes: "",
  emergencyContact: "",
  emergencyPhone: "",
  notes: "",
};

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q } = await searchParams;

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("students");
  const tc = await getTranslations("common");

  const students = await db.studentProfile.findMany({
    where: {
      user: {
        studioId: studio.id,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    },
    include: {
      user: true,
      packs: {
        where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: "asc" },
      },
    },
    orderBy: { user: { name: "asc" } },
    take: 500,
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={`${students.length}`}
        action={
          <SheetForm label={t("newStudent")} title={t("newStudent")}>
            <StudentForm values={EMPTY} />
          </SheetForm>
        }
      />

      <form className="mb-4">
        <Input
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder={tc("search")}
          aria-label={tc("search")}
        />
      </form>

      {students.length === 0 ? (
        <Card>
          <EmptyState message={q ? tc("noResults") : t("empty")} />
        </Card>
      ) : (
        <List>
          {students.map((student) => {
            const credits = student.packs.reduce(
              (sum, pack) =>
                pack.isUnlimited ? sum : sum + Math.max(0, pack.creditsTotal - pack.creditsUsed),
              0,
            );
            const unlimited = student.packs.some((pack) => pack.isUnlimited);
            const birthday =
              student.birthDate && isBirthdayToday(student.birthDate, studio.timezone);

            return (
              <ListRow
                key={student.id}
                href={`/students/${student.id}`}
                leading={
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-semibold text-ink-soft">
                    {student.user.name.slice(0, 1).toUpperCase()}
                  </span>
                }
                title={
                  <span className="flex flex-wrap items-center gap-1.5">
                    {student.user.name}
                    {birthday && <Badge tone="accent">🎂</Badge>}
                    {!student.user.isActive && <Badge>{tc("inactive")}</Badge>}
                    {student.bookingBlocked && <Badge tone="critical">{t("blocked")}</Badge>}
                  </span>
                }
                subtitle={student.user.email}
                trailing={
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {unlimited ? "∞" : student.packs.length > 0 ? credits : "—"}
                  </span>
                }
              />
            );
          })}
        </List>
      )}
    </>
  );
}
