// Labour Chowk :: optional e-mail delivery for in-app notifications (integration point).
//
// In-app notifications always work without this. This Edge Function only adds an e-mail copy
// and does NOTHING unless a provider is configured: with no RESEND_API_KEY it reports
// { sent: false, reason: "no provider configured" } and sends nothing.
//
// Wire-up (Supabase dashboard): Database -> Webhooks -> new webhook on table
// public.notifications, event INSERT, type "Supabase Edge Function" -> send-notification.
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY   API key from resend.com (https://resend.com/api-keys)
//   MAIL_FROM        verified sender, e.g. "Labour Chowk <no-reply@yourdomain.com>"
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.
//   The service-role key lives only here, on the server. It must never reach the frontend.
//
// SMS / WhatsApp / push would follow the same pattern: look up the recipient, call the provider.
// NOTE: this file is not exercised by the repo's automated tests (it needs Deno + a provider).

import { createClient } from 'npm:@supabase/supabase-js@2'

interface NotificationRow { id: string; user_id: string; title: string; message: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('MAIL_FROM')
  if (!apiKey || !from) return json({ sent: false, reason: 'no provider configured' })

  const payload = await req.json().catch(() => null)
  const row = payload?.record as NotificationRow | undefined
  if (payload?.type !== 'INSERT' || !row?.user_id) return json({ sent: false, reason: 'not a notification insert' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: profile, error } = await admin.from('profiles').select('email, full_name').eq('id', row.user_id).maybeSingle()
  if (error || !profile?.email) return json({ sent: false, reason: 'recipient has no e-mail' })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [profile.email], subject: row.title, text: `${row.message}\n\nOpen Labour Chowk to see details.` }),
  })
  if (!res.ok) return json({ sent: false, reason: `provider error ${res.status}` }, 502)
  return json({ sent: true })
})
