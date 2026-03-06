-- Canonicalize status cert default template + existing review content

update status_cert_templates
set template_json = jsonb_build_object(
  'title', coalesce(template_json->>'title', 'Status Certificate Review – Precedent'),
  'mode', 'precedent_locked',
  'disclaimers', jsonb_build_array(
    'Facts are drawn from the provided status certificate package and should be verified against the source documents.',
    'This review does not replace independent legal analysis or partner review.'
  ),
  'sections', jsonb_build_array(
    jsonb_build_object(
      'key', 'summary',
      'title', 'Summary',
      'instructions', 'Provide concise bullet points only for review summary items.',
      'style', 'structured'
    ),
    jsonb_build_object(
      'key', 'follow_ups',
      'title', 'Flags / Follow-ups',
      'instructions', 'Provide concise bullet list of lawyer follow-ups only.',
      'style', 'structured'
    )
  )
),
updated_at = now()
where firm_id is null
  and is_default = true;

with normalized as (
  select
    r.id,
    r.firm_id,
    coalesce(
      nullif(
        string_agg(
          case
            when lower(coalesce(e.elem->>'key', '')) in ('follow_ups', 'flags')
              or lower(coalesce(e.elem->>'title', '')) like '%follow%'
              or lower(coalesce(e.elem->>'title', '')) like '%action item%'
              or lower(coalesce(e.elem->>'title', '')) like '%flag%'
            then null
            else nullif(trim(coalesce(e.elem->>'content', '')), '')
          end,
          E'\n'
        ),
        ''
      ),
      nullif(trim(r.review_text), ''),
      '- Not available'
    ) as summary_content,
    coalesce(
      nullif(
        string_agg(
          case
            when lower(coalesce(e.elem->>'key', '')) in ('follow_ups', 'flags')
              or lower(coalesce(e.elem->>'title', '')) like '%follow%'
              or lower(coalesce(e.elem->>'title', '')) like '%action item%'
              or lower(coalesce(e.elem->>'title', '')) like '%flag%'
            then nullif(trim(coalesce(e.elem->>'content', '')), '')
            else null
          end,
          E'\n'
        ),
        ''
      ),
      '- None'
    ) as follow_up_content
  from status_cert_reviews r
  left join lateral jsonb_array_elements(coalesce(r.review_sections_json, '[]'::jsonb)) e(elem) on true
  group by r.id, r.firm_id, r.review_text
), canonical as (
  select
    n.id,
    n.firm_id,
    jsonb_build_array(
      jsonb_build_object(
        'key', 'summary',
        'title', 'Summary',
        'instructions', '',
        'style', 'structured',
        'content', case
          when trim(n.summary_content) ~ '^-' then n.summary_content
          else '- ' || replace(n.summary_content, E'\n', E'\n- ')
        end
      ),
      jsonb_build_object(
        'key', 'follow_ups',
        'title', 'Flags / Follow-ups',
        'instructions', '',
        'style', 'structured',
        'content', case
          when trim(n.follow_up_content) ~ '^-' then n.follow_up_content
          else '- ' || replace(n.follow_up_content, E'\n', E'\n- ')
        end
      )
    ) as canonical_sections
  from normalized n
)
update status_cert_reviews r
set
  review_sections_json = c.canonical_sections,
  review_text = concat(
    '## Summary\n\n',
    coalesce(c.canonical_sections->0->>'content', '- Not available'),
    '\n\n## Flags / Follow-ups\n\n',
    coalesce(c.canonical_sections->1->>'content', '- None')
  ),
  review_html = concat(
    '<h2>Summary</h2><p>', replace(coalesce(c.canonical_sections->0->>'content', '- Not available'), E'\n', '<br/>'), '</p>',
    '<h2>Flags / Follow-ups</h2><p>', replace(coalesce(c.canonical_sections->1->>'content', '- None'), E'\n', '<br/>'), '</p>'
  ),
  updated_at = now()
from canonical c
where r.id = c.id
  and r.firm_id = c.firm_id
  and (
    coalesce(jsonb_array_length(r.review_sections_json), 0) <> 2
    or coalesce(r.review_sections_json->0->>'key', '') <> 'summary'
    or coalesce(r.review_sections_json->1->>'key', '') <> 'follow_ups'
  );
