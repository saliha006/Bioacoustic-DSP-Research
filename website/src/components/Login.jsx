import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import './Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Bird Detection Review</h1>
        {status === 'sent' ? (
          <p className="login-sent">
            A sign-in link is on its way to <strong>{email}</strong>. Open it on
            this device to start reviewing.
          </p>
        ) : (
          <>
            <p className="login-lede">
              Expert reviewers sign in to verify BirdNET detections. Enter your
              email and we&rsquo;ll send a one-time sign-in link &mdash; no
              password to remember.
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
              <button type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
            {status === 'error' && <p className="login-error">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
