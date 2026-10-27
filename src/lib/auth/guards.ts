import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getCurrentUser, getSupportSession, type SessionUser } from "./session";

export const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "INSTRUCTOR"];
export const ADMIN_ROLES: Role[] = ["OWNER", "ADMIN"];

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  /*
    A suspended studio loses access to the app without losing its data.
    Enforced here rather than at login so an existing session is cut off too,
    and platform admins are exempt so the console cannot lock its own
    operator out of the studio they belong to.
  */
  // Support gets in regardless: fixing what is wrong is the point of the visit.
  const support = await getSupportSession();
  if (user.studio.suspendedAt && !user.isPlatformAdmin && !support) redirect("/suspended");

  /*
    Someone holding a temporary password gets no further than the password
    screen. Checked on every request rather than at login, so a session opened
    with a shared password cannot wander off into the app.
  */
  if (user.mustChangePassword && !support) redirect("/password");

  return user;
}

/** Where a user belongs when they land somewhere they may not see. */
export function homePathFor(role: Role) {
  return role === "STUDENT" ? "/my" : "/dashboard";
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    // Send them to their own home — never back to the page being guarded,
    // which would loop forever.
    redirect(homePathFor(user.role));
  }
  return user;
}

export const requireStaff = () => requireRole(STAFF_ROLES);

/**
 * Resolves the student profile behind the current session.
 *
 * Staff are sent to their own dashboard. A STUDENT missing its profile row is
 * a data inconsistency, so the row is created rather than bounced — sending
 * them to a staff-only page would just ping-pong between guards.
 */
export async function requireStudentProfile() {
  const user = await requireUser();

  if (user.role !== "STUDENT") redirect("/dashboard");

  if (user.studentProfile) return { user, profile: user.studentProfile };

  const profile = await db.studentProfile.create({ data: { userId: user.id } });
  return { user, profile };
}
export const requireAdmin = () => requireRole(ADMIN_ROLES);

/** For server actions: throws instead of redirecting. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!ADMIN_ROLES.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function assertStaff(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!STAFF_ROLES.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/**
 * Platform operator access — the /admin console, which spans every studio.
 *
 * Deliberately strict: this is not a studio role, so being an OWNER grants
 * nothing here. Unauthorised users are sent to their own home rather than
 * shown a 403, which would confirm the console exists.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect(homePathFor(user.role));
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function assertPlatformAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!user.isPlatformAdmin) throw new Error("FORBIDDEN");
  return user;
}

/**
 * True while a platform admin is in a studio's app on its behalf. The few
 * things that belong to the account holder alone — their own password, a
 * payment account, a subscription, push on their phone — check this and refuse.
 */
export async function inSupportVisit() {
  return (await getSupportSession()) !== null;
}
