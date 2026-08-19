/**
 * Opens a free public HTTPS tunnel to the local dev server.
 *
 * Needed because service workers, PWA install and Web Push all require a
 * secure context — a plain http:// LAN address can't provide one. Cloudflare's
 * quick tunnels need no account and no payment.
 *
 * The URL is public while it runs: anyone holding it reaches your dev server,
 * and the register and trial pages are open by design. Stop it with Ctrl-C
 * when you're done. A fresh URL is issued on every start.
 */
import { startTunnel } from "untun";
import { readFileSync, writeFileSync } from "node:fs";

const port = process.env.PORT || 3000;
const envPath = new URL("../.env", import.meta.url);

const tunnel = await startTunnel({ port, acceptCloudflareNotice: true });
const url = await tunnel?.getURL();

if (!url) {
  console.error("Could not open a tunnel. Is the dev server running?");
  process.exit(1);
}

// Magic links and check-in QR codes are absolute; they must point at the
// tunnel or the phone will be sent back to localhost.
let env = readFileSync(envPath, "utf8");
const previous = env.match(/^APP_URL="?([^"\n]*)"?/m)?.[1] ?? "";
env = env.replace(/^APP_URL=.*$/m, `APP_URL="${url}"`);
writeFileSync(envPath, env);

console.log(`
  ✓ Tunnel ready

    ${url}

  APP_URL was updated (${previous} → ${url}).
  Restart the dev server so it picks this up, then open the URL on your phone.

  Install it:
    iPhone   Safari → Share → Add to Home Screen
    Android  Chrome → ⋮ → Install app

  Then sign in and turn on notifications from Ajustes (staff) or Mis clases
  (students). Push only works from the installed app on iOS.

  Ctrl-C to stop. The URL changes each time you start it.
`);

process.on("SIGINT", async () => {
  await tunnel?.close();
  process.exit(0);
});
