import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "./session";

export const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "INSTRUCTOR"];
export const ADMIN_ROLES: Role[] = ["OWNER", "ADMIN"];

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
