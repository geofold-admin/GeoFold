'use client'

import { useState } from 'react'
import type { Locale } from '@/lib/i18n'

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; reference: string }
  | { kind: 'error'; message: string }

/**
 * Posts to /api/contact, which stores the message server-side and returns a reference.
 *
 * It used to open a mailto: link instead, which meant a visitor without a configured mail client
 * — including anyone verifying the site from a browser — had no way to reach us at all.
 *
 * THE LABELS FOLLOW THE LOCALE; THE IDENTITY TABLE ON THE PAGE DOES NOT. Every label here used to
 * read "Nama / Name", and the error strings were English while the success note was both. A form
 * is something you fill in, so it should be in one language — the reader's. The business identity
 * block above it keeps its dual labels on purpose, for the reason set out in page.tsx.
 */

type FormCopy = {
  errInvalid: string
  errRate: string
  errGeneric: string
  errNetwork: (inbox: string) => string
  sentTitle: string
  sentRefBefore: string
  sentRefAfter: string
  sendAnother: string
  name: string
  email: string
  org: string
  subject: string
  subjectPlaceholder: string
  message: string
  sending: string
  send: string
  noCard: string
}

const copy: Record<Locale, FormCopy> = {
  id: {
    errInvalid: 'Periksa kembali isian yang ditandai, lalu coba lagi.',
    errRate:
      'Terlalu banyak pesan dari koneksi ini. Coba lagi dalam satu jam, atau kirim email langsung.',
    errGeneric: 'Pesan tidak bisa dikirim. Silakan coba lagi.',
    errNetwork: (inbox) => `Server tidak bisa dihubungi. Silakan kirim email ke ${inbox}.`,
    sentTitle: 'Terima kasih — pesan Anda sudah kami terima.',
    sentRefBefore: 'Nomor referensi: ',
    sentRefAfter:
      '. Kami membalas ke alamat email yang Anda isikan, umumnya dalam 1 hari kerja.',
    sendAnother: 'Kirim pesan lain',
    name: 'Nama',
    email: 'Email',
    org: 'Organisasi',
    subject: 'Subjek',
    subjectPlaceholder: 'Pertanyaan umum, pembayaran, refund, dukungan teknis…',
    message: 'Pesan',
    sending: 'Mengirim…',
    send: 'Kirim pesan',
    noCard: 'Kami tidak pernah meminta nomor kartu, CVV, PIN, atau OTP melalui formulir ini.',
  },
  en: {
    errInvalid: 'Please check the highlighted fields and try again.',
    errRate:
      'Too many messages from this connection. Please try again in an hour, or email us directly.',
    errGeneric: 'Could not send the message. Please try again.',
    errNetwork: (inbox) => `Could not reach the server. Please email ${inbox} instead.`,
    sentTitle: 'Thank you — your message has been received.',
    sentRefBefore: 'Reference: ',
    sentRefAfter: '. We reply to the email address you gave, usually within one business day.',
    sendAnother: 'Send another message',
    name: 'Name',
    email: 'Email',
    org: 'Organization',
    subject: 'Subject',
    subjectPlaceholder: 'General question, payment, refund, technical support…',
    message: 'Message',
    sending: 'Sending…',
    send: 'Send message',
    noCard: 'We never ask for a card number, CVV, PIN or OTP through this form.',
  },
}

export function ContactForm({ inbox, locale }: { inbox: string; locale: Locale }) {
  const c = copy[locale]

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
        /* The API's own `message` is deliberately NOT shown any more: it is written in one
           language on the server and would contradict whichever one the visitor is reading. The
           error *code* is what gets translated; anything the code does not cover falls back to
           the generic line rather than leaking a server string. */
        const byCode: Record<string, string> = {
          invalid_input: c.errInvalid,
          rate_limited: c.errRate,
        }
        setState({ kind: 'error', message: byCode[data.error] ?? c.errGeneric })
        return
      }

      setState({ kind: 'sent', reference: data.reference ?? '' })
      setName('')
      setEmail('')
      setOrg('')
      setSubject('')
      setMessage('')
    } catch {
      setState({ kind: 'error', message: c.errNetwork(inbox) })
    }
  }

  if (state.kind === 'sent') {
    return (
      <div className="mk-form">
        <div className="mk-note">
          <strong>{c.sentTitle}</strong>
          {state.reference && (
            <>
              <br />
              <br />
              {c.sentRefBefore}
              <strong>{state.reference}</strong>
              {c.sentRefAfter}
            </>
          )}
        </div>
        <button type="button" className="mk-send" onClick={() => setState({ kind: 'idle' })}>
          {c.sendAnother}
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
          {c.name} <span aria-hidden="true">*</span>
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
          {c.email} <span aria-hidden="true">*</span>
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
          {c.org}
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
          {c.subject}
        </label>
        <input
          id="c-subject"
          className="mk-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={c.subjectPlaceholder}
        />
      </div>

      <div>
        <label className="mk-label" htmlFor="c-msg">
          {c.message} <span aria-hidden="true">*</span>
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

      {/* Honeypot — hidden from people, filled in by bots. Not `type=hidden`: bots skip those.
          The label stays untranslated: nobody reads it, and a bot matching on "Website" should
          keep matching whichever language the page is in. */}
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
        {sending ? c.sending : c.send}
      </button>

      <div className="mk-card-foot" style={{ textAlign: 'left' }}>
        {c.noCard}
      </div>
    </form>
  )
}
