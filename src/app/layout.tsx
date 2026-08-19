import type { ReactNode } from "react";

// The real document shell lives in [locale]/layout.tsx — this only exists so
// Next has a root. It must not render <html>, or the locale layout can't.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
