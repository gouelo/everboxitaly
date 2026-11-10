// Vercel serverless function: receives the contact form and sends it via Resend.
// Env vars (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  (required)
//   MAIL_TO         (optional, comma-separated; default below)
//   MAIL_FROM       (optional; default info@everboxitalia.com — domain must be verified in Resend)

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SITE = 'https://www.everboxitalia.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // Accept both urlencoded form posts and JSON
  const b = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body || {});

  // Honeypot: bots fill this hidden field → pretend success
  if (b.website) return res.redirect(303, `${SITE}/?success=true#contatti`);

  const nome = (b.nome || '').trim();
  const cognome = (b.cognome || '').trim();
  const email = (b.email || '').trim();
  if (!nome || !cognome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).send('Dati non validi');
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).send('Server non configurato');

  const from = process.env.MAIL_FROM || 'Everbox Italia <info@everboxitalia.com>';
  const to = (process.env.MAIL_TO || 'europe@everbox.co.il,yoel@everbox.co.il').split(',').map(s => s.trim());

  const rows = [
    ['Nome', `${nome} ${cognome}`],
    ['Email', email],
    ['Telefono', b.telefono],
    ['Modello', b.modello],
    ['Messaggio', b.messaggio],
  ].filter(r => r[1]);

  const html = `<h2>🏠 Nuova richiesta Everbox Italia</h2><table cellpadding="6">` +
    rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('') +
    `</table>`;

  const send = body => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    // 1) Notification to the team (reply goes straight to the customer)
    const r = await send({
      from, to, reply_to: email,
      subject: `🏠 Nuova richiesta Everbox Italia – ${nome} ${cognome}`,
      html,
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).send('Invio non riuscito, riprova o scrivici su WhatsApp.');
    }

    // 2) Auto-reply to the customer (best effort)
    await send({
      from, to: [email], reply_to: to[0],
      subject: 'Everbox Italia – abbiamo ricevuto la tua richiesta',
      html: `<p>Ciao ${esc(nome)},</p><p>grazie per averci contattato! Abbiamo ricevuto la tua richiesta e ti risponderemo al più presto.</p><p>Se preferisci, scrivici su WhatsApp: <a href="https://wa.me/393286191755">+39 328 619 1755</a>.</p><p>— Il team Everbox Italia</p>`,
    }).catch(() => {});
  } catch (e) {
    console.error(e);
    return res.status(502).send('Errore di rete');
  }

  return res.redirect(303, `${SITE}/?success=true#contatti`);
}
