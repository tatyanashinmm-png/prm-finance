// Общий поиск по клиенту/номеру контракта — переиспользуется во всех
// drill-through таблицах (движение, MRR, ARPU), у которых формы контракта
// разные (MovementContract/MonthContract), но оба поля есть в обеих.

export function matchesContractSearch(contract: { contract_num: string; client_name: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return contract.client_name.toLowerCase().includes(q) || contract.contract_num.toLowerCase().includes(q)
}
