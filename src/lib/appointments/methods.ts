import "server-only";
import { isOnlinePaymentEnabled } from "@/lib/payments";

/**
 * How a client may pay this studio's deposits: what the studio switched on,
 * limited to what can actually work. Mercado Pago needs the studio's own
 * account connected, or the platform's configured; a transfer needs a WhatsApp number to send the receipt
 * to. Neither available means no deposit is asked at all.
 */
export function depositMethods(studio: {
  acceptMercadoPago: boolean;
  acceptTransfer: boolean;
  mpConnectedAt: Date | null;
  whatsappNumber: string | null;
}) {
  return {
    mp: studio.acceptMercadoPago && (Boolean(studio.mpConnectedAt) || isOnlinePaymentEnabled()),
    transfer: studio.acceptTransfer && Boolean(studio.whatsappNumber),
  };
}
