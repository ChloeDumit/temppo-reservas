import type { Role, Vertical } from "@/generated/prisma/enums";
import { BILLING_UI_ENABLED } from "@/lib/billing/plans";

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
  { href: "/billing", label: "billing", icon: "card" },
];

// Instructors don't handle money or studio configuration.
const INSTRUCTOR_ALLOWED = ["/dashboard", "/schedule", "/availability", "/checkin", "/students"];

/*
  What the studio owes TEMPPO is the owner's business, not the studio's. An
  ADMIN runs the day to day — students, money coming in, the schedule — but the
  subscription is a contract with the person who signed it.
*/
const OWNER_ONLY = ["/billing"];

const STUDENT_NAV: NavItem[] = [
  { href: "/my", label: "myClasses", icon: "calendar" },
  { href: "/book", label: "book", icon: "plus" },
  { href: "/buy", label: "buy", icon: "ticket" },
];

/*
  An appointment business works from its agenda: who is in the chair and
  when. Nothing about classes, packs or check-in applies.
*/
const BEAUTY_STAFF_NAV: NavItem[] = [
  { href: "/agenda", label: "agenda", icon: "calendar" },
  { href: "/clients", label: "clients", icon: "users" },
  { href: "/services", label: "services", icon: "spark" },
  { href: "/payments", label: "payments", icon: "wallet" },
  { href: "/hours", label: "hours", icon: "clock" },
  { href: "/reports", label: "reports", icon: "chart" },
  { href: "/settings", label: "settings", icon: "settings" },
  { href: "/billing", label: "billing", icon: "card" },
];

const BEAUTY_INSTRUCTOR_ALLOWED = ["/agenda", "/clients", "/hours"];

const BEAUTY_CLIENT_NAV: NavItem[] = [{ href: "/appointments", label: "myAppointments", icon: "calendar" }];

/*
  Withheld from everyone, regardless of role, while billing is not yet live.
  See BILLING_UI_ENABLED: the route still answers, it is only unadvertised.
*/
const HIDDEN = BILLING_UI_ENABLED ? [] : ["/billing"];

export function navFor(role: Role, vertical: Vertical = "CLASSES"): NavItem[] {
  const beauty = vertical === "APPOINTMENTS";
  if (role === "STUDENT") return beauty ? BEAUTY_CLIENT_NAV : STUDENT_NAV;

  const staff = (beauty ? BEAUTY_STAFF_NAV : STAFF_NAV).filter((i) => !HIDDEN.includes(i.href));

  if (role === "INSTRUCTOR") {
    const allowed = beauty ? BEAUTY_INSTRUCTOR_ALLOWED : INSTRUCTOR_ALLOWED;
    return staff.filter((i) => allowed.includes(i.href));
  }
  if (role === "ADMIN") return staff.filter((i) => !OWNER_ONLY.includes(i.href));
  return staff;
}

/**
 * The phone tab bar holds four destinations plus a "More" button. Splitting
 * here — rather than truncating — is what keeps every section reachable by
 * thumb instead of stranding half the app off-screen.
 */
export const TAB_SLOTS = 4;

export function splitNav(role: Role, vertical: Vertical = "CLASSES") {
  const items = navFor(role, vertical);
  return {
    primary: items.slice(0, TAB_SLOTS),
    overflow: items.slice(TAB_SLOTS),
  };
}
