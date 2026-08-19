"use client";

import { useTranslations } from "next-intl";
import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { Icon } from "./icon";

export function LogoutButton() {
  const t = useTranslations("nav");
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="pressable touch-target flex w-full items-center gap-3 rounded-md px-3 text-sm text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
      >
        <Icon name="logout" className="size-[18px]" />
        {t("logout")}
      </button>
    </form>
  );
}
