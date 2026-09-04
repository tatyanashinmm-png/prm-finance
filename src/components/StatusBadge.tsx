/** Бейдж статуса контракта — переиспользуется в детализации оттока и в детализации MRR. */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (status === 'Блок') return <span className="status-badge status-badge--block">Блок</span>
  return <span className="movement-panel__badge">{status ?? 'Активен'}</span>
}
