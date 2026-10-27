"use server";

import { cookies } from "next/headers";
import { assertPlatformAdmin } from "@/lib/auth/guards";
import { ADMIN_PRODUCT_COOKIE, type AdminProduct } from "@/lib/admin/product";

export async function setAdminProductAction(product: AdminProduct) {
  await assertPlatformAdmin();
  const store = await cookies();
  store.set(ADMIN_PRODUCT_COOKIE, product === "beauty" ? "beauty" : "temppo", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}
