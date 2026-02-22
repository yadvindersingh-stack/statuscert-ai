import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFirmId } from "@/lib/auth";
import { DEFAULT_TEMPLATE } from "@/lib/statuscert/templates";
import { reviewTextToSections } from "@/lib/statuscert/editor";

function htmlFromSections(sections: { title: string; content?: string }[]) {
  return sections
    .map((section) => `<h2>${section.title}</h2><p>${(section.content || "").replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export async function POST(request: Request) {
  const { firmId } = await requireFirmId();
  const { reviewId, reviewText, sections } = await request.json();

  const supabase = createServerSupabaseClient();
  const { data: review } = await supabase
    .from("status_cert_reviews")
    .select("id, template_id")
    .eq("id", reviewId)
    .eq("firm_id", firmId)
    .single();

  let template = DEFAULT_TEMPLATE;
  if (review?.template_id) {
    const { data: templateRow } = await supabase
      .from("status_cert_templates")
      .select("template_json")
      .eq("id", review.template_id)
      .single();
    if (templateRow?.template_json) template = templateRow.template_json;
  }

  const finalSections = reviewText
    ? reviewTextToSections(template.sections, reviewText)
    : sections;
  const finalText = reviewText || "";
  const finalHtml = htmlFromSections(finalSections || []);

  await supabase
    .from("status_cert_reviews")
    .update({
      review_sections_json: finalSections,
      review_text: finalText,
      review_html: finalHtml,
      status: "READY",
      updated_at: new Date().toISOString()
    })
    .eq("id", reviewId)
    .eq("firm_id", firmId);

  return NextResponse.json({ ok: true });
}
