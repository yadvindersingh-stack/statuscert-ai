export type StatusCertJobType = 'GENERATE_DRAFT' | 'EXPORT_DOCX';
export type StatusCertJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export const ACTIVE_JOB_STATUSES: StatusCertJobStatus[] = ['QUEUED', 'RUNNING'];

export function stageLabel(stage?: string | null) {
  switch (stage) {
    case 'VALIDATING':
      return 'Queued';
    case 'OCR_PARSE':
      return 'OCR / Parsing';
    case 'EXTRACT_LLM':
      return 'Field Extraction';
    case 'GENERATE_LLM':
      return 'Draft Generation';
    case 'DOCX_BUILD':
      return 'Building DOCX';
    case 'UPLOAD_EXPORT':
      return 'Uploading Export';
    default:
      return stage || 'Processing';
  }
}

export function mapReviewStatus(raw: string) {
  if (raw === 'PROCESSING') return 'PROCESSING';
  if (raw === 'READY' || raw === 'REVIEW_GENERATED' || raw === 'FINALIZED') return 'READY';
  if (raw === 'EXPORTED') return 'EXPORTED';
  if (raw === 'FAILED') return 'FAILED';
  return 'DRAFT';
}
