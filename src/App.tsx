import { useEffect, useState } from 'react'

interface Contract {
  id: number
  contractNum: string
  clientName: string
}

function App() {
  const [health, setHealth] = useState<string>('загрузка…')
  const [contracts, setContracts] = useState<Contract[] | null>(null)
  const [contractsError, setContractsError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(JSON.stringify(data)))
      .catch((err) => setHealth('ошибка: ' + String(err)))

    fetch('/api/contracts')
      .then((res) => res.json())
      .then((data) => setContracts(data.contracts))
      .catch((err) => setContractsError(String(err)))
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>PRM Finance — скелет готов</h1>
      <p>Ответ /api/health: {health}</p>

      <h2>Контракты</h2>
      {contractsError && <p>Ошибка: {contractsError}</p>}
      {!contractsError && contracts === null && <p>Загрузка…</p>}
      {contracts !== null && (
        <>
          <p>Всего контрактов: {contracts.length}</p>
          <ul>
            {contracts.map((c) => (
              <li key={c.id}>
                {c.contractNum} — {c.clientName}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default App
