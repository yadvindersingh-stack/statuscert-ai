import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { firmId, user } = await requireFirmId();
  const formData = await request.formData();
  const plan = String(formData.get("plan"));

  const supabase = createServerSupabaseClient();
  await supabase.from("status_cert_events").insert({
    firm_id: firmId,
    actor_id: user.id,
    event_type: "billing_checkout_started",
    payload: { plan }
  });

  const { data: billing } = await supabase
    .from("firm_billing")
    .select("stripe_customer_id")
    .eq("firm_id", firmId)
    .single();

  let customerId = billing?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: { firm_id: firmId }
    });
    customerId = customer.id;
    await supabase
      .from("firm_billing")
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("firm_id", firmId);
  }

  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

  if (plan === "monthly" || plan === "yearly") {
    const priceId = plan === "monthly" ? process.env.STRIPE_PRICE_ID_MONTHLY : process.env.STRIPE_PRICE_ID_YEARLY;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId!, quantity: 1 }],
      success_url: `${baseUrl}/app/billing?success=true`,
      cancel_url: `${baseUrl}/app/billing?canceled=true`
    });

    return NextResponse.redirect(session.url!, { status: 303 });
  }

  if (plan === "credit") {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID_CREDIT_10!, quantity: 1 }],
      success_url: `${baseUrl}/app/billing?success=true`,
      cancel_url: `${baseUrl}/app/billing?canceled=true`
    });

    return NextResponse.redirect(session.url!, { status: 303 });
  }

  return NextResponse.json({ ok: false, error: "Invalid plan" }, { status: 400 });
}
