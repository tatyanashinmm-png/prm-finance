import { useEffect, useState } from 'react'

interface Contract {
  id: number
  contractNum: string
  clientName: string
}

export function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/contracts')
      .then((res) => res.json())
      .then((data) => setContracts(data.contracts))
      .catch((err) => setError(String(err)))
  }, [])

  return (
    <div className="page">
      <h1 className="page__title">Контракты</h1>
      <div className="card">
        {error && <p className="state-msg state-msg--error">Ошибка: {error}</p>}
        {!error && contracts === null && <p className="state-msg">Загрузка…</p>}
        {contracts !== null && (
          <>
            <p className="state-msg" style={{ padding: '0 0 12px' }}>
              Всего контрактов: {contracts.length}
            </p>
            <ul className="contracts-list">
              {contracts.map((c) => (
                <li key={c.id}>
                  <span className="contract-num">{c.contractNum}</span>
                  {c.clientName}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
