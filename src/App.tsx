import { useEffect, useState } from 'react'
import { TopNav, type SectionId } from './components/TopNav'
import { OverviewPage } from './pages/OverviewPage'
import { ContractsPage } from './pages/ContractsPage'
import { UsersPage } from './pages/UsersPage'

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
    <div className="login-screen">
      <div className="login-card">
        <h1>PRM Finance — вход</h1>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-username">Логин</label>
            <input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Пароль</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Dashboard({ user, onLogout }: { user: AuthedUser; onLogout: () => void }) {
  const [section, setSection] = useState<SectionId>('dashboard')

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    onLogout()
  }

  return (
    <>
      <TopNav active={section} onChange={setSection} username={user.username} role={user.role} onLogout={logout} />
      {section === 'dashboard' && <OverviewPage />}
      {section === 'database' && <ContractsPage />}
      {section === 'users' && <UsersPage />}
    </>
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
      <div className="page">
        <p className="state-msg">Загрузка…</p>
      </div>
    )
  }

  if (state === 'anon' || !user) {
    return <LoginForm onSuccess={checkAuth} />
  }

  return <Dashboard user={user} onLogout={() => setState('anon')} />
}

export default App
