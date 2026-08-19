/**
 * Prints the URLs to open on a phone that's on the same Wi-Fi, and reminds you
 * to point APP_URL at the LAN address so magic links and QR codes resolve from
 * the phone rather than from localhost.
 */
import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";

const port = process.env.PORT || "3000";

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net.address);

if (addresses.length === 0) {
  console.log("No LAN address found — is Wi-Fi on?");
  process.exit(0);
}

const primary = addresses[0];
const base = `http://${primary}:${port}`;

let appUrl = "";
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  appUrl = env.match(/^APP_URL="?([^"\n]+)"?/m)?.[1] ?? "";
} catch {
  // No .env yet — the hint below still applies.
}

console.log(`
  Open on your phone (same Wi-Fi):

    ${base}

  Studio app   ${base}/login
  Trial page   ${base}/t/estudio-anima
${addresses.length > 1 ? `\n  Other addresses: ${addresses.slice(1).join(", ")}` : ""}
`);

if (appUrl && !appUrl.includes(primary)) {
  console.log(`  ⚠  APP_URL is ${appUrl}
     Magic links and QR codes will point there, which a phone can't reach.
     For device testing set:  APP_URL="${base}"
`);
}
