import { NextResponse } from 'next/server';
import { requireFirmId } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { firmId } = await requireFirmId();
  const supabase = createServerSupabaseClient();
  const admin = createServiceSupabaseClient();

  const { data: review } = await supabase
    .from('status_cert_reviews')
    .select('id, exported_doc_path, updated_at')
    .eq('id', params.id)
    .eq('firm_id', firmId)
    .single();

  if (!review?.exported_doc_path) {
    return NextResponse.json({ ok: false, error: 'No export found' }, { status: 404 });
  }

  const { data, error } = await admin.storage.from('documents').createSignedUrl(review.exported_doc_path, 60 * 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to create signed url' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, downloadUrl: data.signedUrl, path: review.exported_doc_path, exportedAt: review.updated_at });
}
