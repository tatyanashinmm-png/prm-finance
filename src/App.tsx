import { useEffect, useState } from 'react'

interface Contract {
  id: number
  contractNum: string
  clientName: string
}

interface AuthedUser {
  username: string
  role: string
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'не удалось войти')
        return
      }
      onSuccess()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: 320 }}>
      <h1>PRM Finance — вход</h1>
      <form onSubmit={submit}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Логин
            <br />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Пароль
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
        </div>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}

function Dashboard({ user, onLogout }: { user: AuthedUser; onLogout: () => void }) {
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

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    onLogout()
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>PRM Finance — скелет готов</h1>
        <div>
          {user.username} ({user.role}) · <button onClick={logout}>Выйти</button>
        </div>
      </div>
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

function App() {
  const [state, setState] = useState<'loading' | 'anon' | 'authed'>('loading')
  const [user, setUser] = useState<AuthedUser | null>(null)

  const checkAuth = () => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          setState('anon')
          return
        }
        return res.json().then((data: AuthedUser) => {
          setUser(data)
          setState('authed')
        })
      })
      .catch(() => setState('anon'))
  }

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (state === 'authed' && window.location.pathname === '/login') {
      window.location.replace('/')
    }
  }, [state])

  if (state === 'loading') {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p>Загрузка…</p>
      </div>
    )
  }

  if (state === 'anon' || !user) {
    return <LoginForm onSuccess={checkAuth} />
  }

  return <Dashboard user={user} onLogout={() => setState('anon')} />
}

export default App
