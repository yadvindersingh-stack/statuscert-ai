import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFirmId } from "@/lib/auth";
import { generateReview } from "@/lib/statuscert/generate";
import { DEFAULT_TEMPLATE } from "@/lib/statuscert/templates";
import { canGenerateReview, consumeEntitlement } from "@/lib/statuscert/entitlements";
import { sectionsToReviewText } from "@/lib/statuscert/editor";
import { ReviewSection } from "@/lib/statuscert/types";
import { getFirmEntitlement } from "@/lib/billing";

function htmlFromSections(sections: { title: string; content?: string }[]) {
  return sections
    .map((section) => `<h2>${section.title}</h2><p>${(section.content || "").replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export async function POST(request: Request) {
  const { firmId, user } = await requireFirmId();
  const { reviewId, templateId } = await request.json();

  const supabase = createServerSupabaseClient();
  const { data: review } = await supabase
    .from("status_cert_reviews")
    .select("id, extracted_json, template_id, review_sections_json")
    .eq("id", reviewId)
    .eq("firm_id", firmId)
    .single();

  if (!review?.extracted_json) {
    return NextResponse.json({ ok: false, error: "Run extraction first." }, { status: 400 });
  }

  const entitlementState = await getFirmEntitlement(firmId, user.email);

  if (!canGenerateReview(entitlementState)) {
    return NextResponse.json(
      {
        ok: false,
        code: "ENTITLEMENT_REQUIRED",
        reason: entitlementState.reason,
        trialRemaining: entitlementState.trialRemaining,
        creditsBalance: entitlementState.creditsBalance,
        billingUrl: "/app/billing?source=gate"
      },
      { status: 402 }
    );
  }

  const templateLookupId = templateId || review.template_id;
  let template = DEFAULT_TEMPLATE;
  let firmName = "Firm";

  const { data: firm } = await supabase
    .from("firms")
    .select("name")
    .eq("id", firmId)
    .single();
  if (firm?.name) firmName = firm.name;

  if (templateLookupId) {
    const { data: templateRow } = await supabase
      .from("status_cert_templates")
      .select("template_json")
      .eq("id", templateLookupId)
      .single();
    if (templateRow?.template_json) {
      template = templateRow.template_json;
    }
  } else {
    const { data: defaultTemplate } = await supabase
      .from("status_cert_templates")
      .select("template_json")
      .eq("firm_id", firmId)
      .eq("is_default", true)
      .maybeSingle();
    if (defaultTemplate?.template_json) {
      template = defaultTemplate.template_json;
    }
  }

  const { sections, flags, followUps, model, promptVersion } = await generateReview({
    extracted: review.extracted_json,
    template,
    firmName,
    disclaimers: template.disclaimers || []
  });

  const followUpSection: ReviewSection[] = followUps?.length
    ? [{ key: "follow_ups", title: "Follow-ups / Action Items", instructions: "", style: "narrative", content: followUps.map((f) => `- ${f}`).join("\n") }]
    : [];

  const finalSections = [...sections, ...followUpSection];
  const reviewText = sectionsToReviewText(finalSections);
  const reviewHtml = htmlFromSections(finalSections);

  await supabase
    .from("status_cert_reviews")
    .update({
      review_sections_json: finalSections,
      flags_json: flags,
      review_text: reviewText,
      review_html: reviewHtml,
      status: "READY",
      model,
      prompt_version: promptVersion,
      updated_at: new Date().toISOString()
    })
    .eq("id", reviewId)
    .eq("firm_id", firmId);

  if (!entitlementState.founderOverride && !entitlementState.activeSubscription) {
    const consumed = consumeEntitlement(entitlementState);
    await supabase
      .from("firm_billing")
      .update({
        trial_remaining: consumed.trialRemaining,
        credits_balance: consumed.creditsBalance,
        updated_at: new Date().toISOString()
      })
      .eq("firm_id", firmId);
  }

  await supabase.from("status_cert_events").insert({
    firm_id: firmId,
    review_id: reviewId,
    actor_id: user.id,
    event_type: "REVIEW_GENERATED",
    payload: { followUps }
  });

  return NextResponse.json({ ok: true });
}
