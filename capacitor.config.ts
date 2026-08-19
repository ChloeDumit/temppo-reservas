import type { CapacitorConfig } from "@capacitor/cli";

/**
 * TEMPPO Reservas native shell.
 *
 * The app is server-rendered (RSC + Server Actions talking to Postgres), so the
 * native build can't be a static bundle — it loads the deployed site instead.
 * Point TEMPPO_APP_URL at your deployment before running `npx cap sync`.
 *
 * For local device testing over Wi-Fi, set it to your machine's LAN address,
 * e.g. TEMPPO_APP_URL=http://192.168.2.86:3000
 */
const serverUrl = process.env.TEMPPO_APP_URL;

const config: CapacitorConfig = {
  appId: "uy.temppo.reservas",
  appName: "TEMPPO Reservas",
  // Placeholder shell; the real UI comes from `server.url`.
  webDir: "native/www",
  ios: {
    contentInset: "never",
    // The web layout already handles safe areas via env(safe-area-inset-*).
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: true,
  },
  server: serverUrl
    ? {
        url: serverUrl,
        // Plain http is only tolerated for LAN testing, never for production.
        cleartext: serverUrl.startsWith("http://"),
      }
    : undefined,
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#fbf8f5",
      showSpinner: false,
    },
  },
};

export default config;
