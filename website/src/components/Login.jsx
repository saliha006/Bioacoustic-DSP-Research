import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import './Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('signing-in')
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setStatus('error')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Bird Detection Review</h1>
        <p className="login-lede">
          Expert reviewers sign in to verify BirdNET detections.
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@northumbria.ac.uk"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" disabled={status === 'signing-in'}>
            {status === 'signing-in' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {status === 'error' && <p className="login-error">{error}</p>}
      </div>
    </div>
  )
}
