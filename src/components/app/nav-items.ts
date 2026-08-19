import type { Role } from "@/generated/prisma/enums";

export type NavItem = {
  href: string;
  /** key under the `nav` message namespace */
  label: string;
  icon: string;
};

const STAFF_NAV: NavItem[] = [
  { href: "/dashboard", label: "dashboard", icon: "grid" },
  { href: "/schedule", label: "schedule", icon: "calendar" },
  { href: "/checkin", label: "checkin", icon: "scan" },
  { href: "/availability", label: "availability", icon: "repeat" },
  { href: "/students", label: "students", icon: "users" },
  { href: "/classes", label: "classes", icon: "repeat" },
  { href: "/leads", label: "leads", icon: "spark" },
  { href: "/packs", label: "packs", icon: "ticket" },
  { href: "/payments", label: "payments", icon: "wallet" },
  { href: "/reports", label: "reports", icon: "chart" },
  { href: "/settings", label: "settings", icon: "settings" },
];

// Instructors don't handle money or studio configuration.
const INSTRUCTOR_ALLOWED = ["/dashboard", "/schedule", "/availability", "/checkin", "/students"];

const STUDENT_NAV: NavItem[] = [
  { href: "/my", label: "myClasses", icon: "calendar" },
  { href: "/book", label: "book", icon: "plus" },
  { href: "/buy", label: "buy", icon: "ticket" },
];

export function navFor(role: Role): NavItem[] {
  if (role === "STUDENT") return STUDENT_NAV;
  if (role === "INSTRUCTOR") return STAFF_NAV.filter((i) => INSTRUCTOR_ALLOWED.includes(i.href));
  return STAFF_NAV;
}

/**
 * The phone tab bar holds four destinations plus a "More" button. Splitting
 * here — rather than truncating — is what keeps every section reachable by
 * thumb instead of stranding half the app off-screen.
 */
export const TAB_SLOTS = 4;

export function splitNav(role: Role) {
  const items = navFor(role);
  return {
    primary: items.slice(0, TAB_SLOTS),
    overflow: items.slice(TAB_SLOTS),
  };
}
