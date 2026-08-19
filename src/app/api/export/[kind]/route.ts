import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { instructorPayroll, toCsv } from "@/lib/reports";
import { recordAudit } from "@/lib/audit";

const KINDS = ["payments", "transactions", "bookings", "payroll", "students", "audit"] as const;
type Kind = (typeof KINDS)[number];

function parseRange(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const now = new Date();

  return {
    from: from ? new Date(`${from}T00:00:00Z`) : new Date(now.getFullYear(), now.getMonth(), 1),
    // `to` is inclusive for the user, so push the boundary to the next day.
    to: to ? new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000) : now,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) {
    return NextResponse.json({ error: "unknown export" }, { status: 404 });
  }

  const range = parseRange(request);
  const studioId = user.studioId;
  const iso = (date: Date) => date.toISOString();

  let csv = "";

  if (kind === "payments") {
    const rows = await db.payment.findMany({
      where: { studioId, createdAt: { gte: range.from, lt: range.to } },
      include: { student: { include: { user: true } }, studentPack: { include: { pack: true } } },
      orderBy: { createdAt: "asc" },
    });
    csv = toCsv(
      ["date", "student", "email", "pack", "amount", "currency", "method", "status", "reference"],
      rows.map((row) => [
        iso(row.createdAt),
        row.student.user.name,
        row.student.user.email,
        row.studentPack?.pack.name ?? "",
        (row.amountCents / 100).toFixed(2),
        row.currency,
        row.method,
        row.status,
        row.reference ?? "",
      ]),
    );
  } else if (kind === "transactions") {
    const rows = await db.transaction.findMany({
      where: { studioId, occurredAt: { gte: range.from, lt: range.to } },
      orderBy: { occurredAt: "asc" },
    });
    csv = toCsv(
      ["date", "type", "category", "description", "amount"],
      rows.map((row) => [
        iso(row.occurredAt),
        row.type,
        row.category,
        row.description ?? "",
        (row.amountCents / 100).toFixed(2),
      ]),
    );
  } else if (kind === "bookings") {
    const rows = await db.booking.findMany({
      where: { studioId, classInstance: { startsAt: { gte: range.from, lt: range.to } } },
      include: {
        student: { include: { user: true } },
        classInstance: { include: { instructor: { include: { user: true } } } },
      },
      orderBy: { classInstance: { startsAt: "asc" } },
    });
    csv = toCsv(
      ["class_date", "class", "instructor", "student", "email", "status", "source", "checked_in"],
      rows.map((row) => [
        iso(row.classInstance.startsAt),
        row.classInstance.name,
        row.classInstance.instructor?.user.name ?? "",
        row.student.user.name,
        row.student.user.email,
        row.status,
        row.source,
        row.checkedInAt ? iso(row.checkedInAt) : "",
      ]),
    );
  } else if (kind === "payroll") {
    const rows = await instructorPayroll(studioId, range);
    csv = toCsv(
      ["instructor", "classes", "minutes", "attendees", "basis", "pay"],
      rows.map((row) => [
        row.name,
        row.classes,
        row.minutes,
        row.attendees,
        row.basis,
        (row.payCents / 100).toFixed(2),
      ]),
    );
  } else if (kind === "students") {
    const rows = await db.studentProfile.findMany({
      where: { user: { studioId } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    });
    csv = toCsv(
      ["name", "email", "phone", "birth_date", "active", "no_shows", "blocked", "emergency_contact"],
      rows.map((row) => [
        row.user.name,
        row.user.email,
        row.user.phone ?? "",
        row.birthDate ? row.birthDate.toISOString().slice(0, 10) : "",
        row.user.isActive ? "yes" : "no",
        row.noShowCount,
        row.bookingBlocked ? "yes" : "no",
        row.emergencyContact ?? "",
      ]),
    );
  } else {
    const rows = await db.auditLog.findMany({
      where: { studioId, createdAt: { gte: range.from, lt: range.to } },
      include: { actor: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
    csv = toCsv(
      ["date", "actor", "action", "entity_type", "entity_id", "ip", "metadata"],
      rows.map((row) => [
        iso(row.createdAt),
        row.actor?.name ?? row.actorLabel ?? "",
        row.action,
        row.entityType,
        row.entityId ?? "",
        row.ipAddress ?? "",
        row.metadata ? JSON.stringify(row.metadata) : "",
      ]),
    );
  }

  await recordAudit({
    studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "report.export",
    entityType: "Export",
    entityId: kind,
    metadata: { from: iso(range.from), to: iso(range.to) },
  });

  const stamp = range.from.toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="temppo-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
