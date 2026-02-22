update public.status_cert_templates
set template_json = jsonb_set(
  template_json,
  '{disclaimers}',
  '[
    "Facts are drawn from the provided status certificate package and should be verified against the source documents.",
    "This review does not replace independent legal analysis or partner review."
  ]'::jsonb,
  true
),
updated_at = now()
where firm_id is null
  and is_default = true;

