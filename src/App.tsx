import { useEffect, useState } from 'react'

function App() {
  const [health, setHealth] = useState<string>('загрузка…')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(JSON.stringify(data)))
      .catch((err) => setHealth('ошибка: ' + String(err)))
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>PRM Finance — работает</h1>
      <p>Ответ /api/health: {health}</p>
    </div>
  )
}

export default App
