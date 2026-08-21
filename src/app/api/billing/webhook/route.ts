import { NextRequest, NextResponse } from "next/server";
import {
  recordAuthorizedPayment,
  resolveBillingTopic,
  syncPreapproval,
  verifyBillingSignature,
} from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * Subscription callbacks from TEMPPO's own Mercado Pago account.
 *
 * Separate from /api/payments/webhook on purpose: that endpoint is the studio's
 * money and is keyed on a StudentPack, this one is ours and is keyed on a
 * preapproval. They are different accounts signing with different secrets, so
 * they cannot share a route without one of them trusting the other's key.
 *
 * As with the studio webhook, the body is only a pointer — every decision is
 * made from what the provider's API says when we go and ask it.
 */
export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = payload as {
    type?: string;
    entity?: string;
    action?: string;
    data?: { id?: string | number };
  };

  const dataId = body.data?.id;
  const signatureOk = verifyBillingSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestIdHeader: request.headers.get("x-request-id"),
    dataId: dataId != null ? String(dataId) : null,
  });

  if (!signatureOk) {
    console.warn("[billing/webhook] rejected: bad signature");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (dataId == null) return NextResponse.json({ ok: true });

  const topic = resolveBillingTopic(body);

  try {
    if (topic === "preapproval") {
      await syncPreapproval(String(dataId));
    } else if (topic === "authorizedPayment") {
      await recordAuthorizedPayment(String(dataId));
    }
    // Anything else — plain payments, plan updates — isn't ours to act on.
  } catch (error) {
    console.error("[billing/webhook] handler failed", error);
  }

  // Always 200 once the signature checks out, so the provider stops retrying a
  // message we have already looked at and decided we cannot use.
  return NextResponse.json({ ok: true });
}
