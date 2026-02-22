export type StatusCertExecutionMode = 'inline' | 'queue';

export function getStatusCertExecutionMode(): StatusCertExecutionMode {
  const raw = (process.env.STATUSCERT_EXECUTION_MODE || '').trim().toLowerCase();
  if (raw === 'inline' || raw === 'queue') return raw;
  return process.env.NODE_ENV === 'production' ? 'queue' : 'inline';
}

