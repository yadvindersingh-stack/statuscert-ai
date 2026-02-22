import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { stripe } from "@/lib/stripe";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature") || "";
  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET || "");
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }

  const admin = createServiceSupabaseClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const customerId = session.customer as string;
    const customer = await stripe.customers.retrieve(customerId) as any;
    const firmId = customer.metadata?.firm_id;

    if (!firmId) return NextResponse.json({ ok: true });

    if (session.mode === "subscription") {
      const subscription = await stripe.subscriptions.retrieve(session.subscription, { expand: ["items.data.price"] });
      const priceId = subscription.items.data[0]?.price?.id;
      const planType =
        priceId === process.env.STRIPE_PRICE_ID_MONTHLY
          ? "monthly"
          : priceId === process.env.STRIPE_PRICE_ID_YEARLY
          ? "yearly"
          : "monthly";

      await admin.from("firm_billing").update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        plan_type: planType,
        status: "active",
        updated_at: new Date().toISOString()
      }).eq("firm_id", firmId);
      await admin.from("status_cert_events").insert({
        firm_id: firmId,
        event_type: "billing_checkout_completed",
        payload: { mode: "subscription", planType }
      });
    }

    if (session.mode === "payment") {
      const rpc = await admin.rpc("increment_credits", { firm_id: firmId, amount: 1 });
      if (rpc.error) {
        const { data: billing } = await admin.from("firm_billing").select("credits_balance").eq("firm_id", firmId).single();
        const credits = (billing?.credits_balance || 0) + 1;
        await admin.from("firm_billing").update({ credits_balance: credits, updated_at: new Date().toISOString() }).eq("firm_id", firmId);
      }
      await admin.from("status_cert_events").insert({
        firm_id: firmId,
        event_type: "billing_checkout_completed",
        payload: { mode: "payment", creditsAdded: 1 }
      });
    }
  }

  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as any;
    const customerId = subscription.customer as string;
    const customer = await stripe.customers.retrieve(customerId) as any;
    const firmId = customer.metadata?.firm_id;

    if (firmId) {
      await admin.from("firm_billing").update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        updated_at: new Date().toISOString()
      }).eq("firm_id", firmId);
    }
  }

  return NextResponse.json({ ok: true });
}
