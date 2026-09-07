'use client'

import { useState } from 'react'

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; reference: string }
  | { kind: 'error'; message: string }

const MESSAGES: Record<string, string> = {
  invalid_input: 'Please check the highlighted fields and try again.',
  rate_limited: 'Too many messages from this connection. Please try again in an hour, or email us directly.',
}

/**
 * Posts to /api/contact, which stores the message server-side and returns a reference.
 *
 * It used to open a mailto: link instead, which meant a visitor without a configured mail client
 * — including anyone verifying the site from a browser — had no way to reach us at all.
 */
export function ContactForm({ inbox }: { inbox: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [org, setOrg] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [bad, setBad] = useState<string[]>([])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState({ kind: 'sending' })
    setBad([])

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, organization: org, subject, message, website }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setBad(Array.isArray(data.fields) ? data.fields : [])
        setState({
          kind: 'error',
          message: MESSAGES[data.error] ?? data.message ?? 'Could not send the message. Please try again.',
        })
        return
      }

      setState({ kind: 'sent', reference: data.reference ?? '' })
      setName('')
      setEmail('')
      setOrg('')
      setSubject('')
      setMessage('')
    } catch {
      setState({
        kind: 'error',
        message: `Could not reach the server. Please email ${inbox} instead.`,
      })
    }
  }

  if (state.kind === 'sent') {
    return (
      <div className="mk-form">
        <div className="mk-note">
          <strong>Terima kasih — pesan Anda sudah kami terima.</strong>
          <br />
          Thank you — your message has been received.
          {state.reference && (
            <>
              <br />
              <br />
              Nomor referensi / reference: <strong>{state.reference}</strong>. Kami membalas ke{' '}
              alamat email yang Anda isikan, umumnya dalam 1 hari kerja.
            </>
          )}
        </div>
        <button type="button" className="mk-send" onClick={() => setState({ kind: 'idle' })}>
          Send another message
        </button>
      </div>
    )
  }

  const invalid = (field: string) => (bad.includes(field) ? { borderColor: '#c0574b' } : undefined)
  const sending = state.kind === 'sending'

  return (
    <form className="mk-form" onSubmit={onSubmit} noValidate>
      {state.kind === 'error' && <div className="mk-error">{state.message}</div>}

      <div>
        <label className="mk-label" htmlFor="c-name">
          Nama / Name <span aria-hidden="true">*</span>
        </label>
        <input
          id="c-name"
          className="mk-input"
          style={invalid('name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </div>

      <div>
        <label className="mk-label" htmlFor="c-email">
          Email <span aria-hidden="true">*</span>
        </label>
        <input
          id="c-email"
          type="email"
          className="mk-input"
          style={invalid('email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div>
        <label className="mk-label" htmlFor="c-org">
          Organisasi / Organization
        </label>
        <input
          id="c-org"
          className="mk-input"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          autoComplete="organization"
        />
      </div>

      <div>
        <label className="mk-label" htmlFor="c-subject">
          Subjek / Subject
        </label>
        <input
          id="c-subject"
          className="mk-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Pertanyaan umum, pembayaran, refund, dukungan teknis…"
        />
      </div>

      <div>
        <label className="mk-label" htmlFor="c-msg">
          Pesan / Message <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="c-msg"
          rows={6}
          className="mk-input"
          style={invalid('message')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
      </div>

      {/* Honeypot — hidden from people, filled in by bots. Not `type=hidden`: bots skip those. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor="c-website">Website</label>
        <input
          id="c-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <button type="submit" className="mk-send" disabled={sending}>
        {sending ? 'Mengirim…' : 'Kirim pesan / Send message'}
      </button>

      <div className="mk-card-foot" style={{ textAlign: 'left' }}>
        Kami tidak pernah meminta nomor kartu, CVV, PIN, atau OTP melalui formulir ini.
      </div>
    </form>
  )
}
