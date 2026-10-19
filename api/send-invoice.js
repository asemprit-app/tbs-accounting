// api/send-invoice.js
// Función de backend (Vercel Serverless Function). Se ejecuta en el servidor,
// nunca en el navegador — por eso aquí sí es seguro usar la llave de Resend.
//
// Necesita la variable de entorno RESEND_API_KEY configurada en Vercel
// (Project Settings -> Environment Variables), y opcionalmente RESEND_FROM
// (por ejemplo: "Twelve Business Strategies <invoices@twelvestrategies.com>").
// El dominio usado en RESEND_FROM tiene que estar verificado en tu cuenta de Resend.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  const authorization = req.headers?.authorization;
  const token = typeof authorization === 'string' && /^Bearer\s+\S+$/i.test(authorization)
    ? authorization.replace(/^Bearer\s+/i, '') : '';
  if (!token) return res.status(401).json({ error: 'A staff session is required.' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Session verification is unavailable.' });
  }
  try {
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${token}` };
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid or expired session.' });
    const user = await userRes.json();
    if (!user?.id) return res.status(401).json({ error: 'Invalid session.' });
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}`, { headers });
    if (!profileRes.ok) return res.status(503).json({ error: 'Could not verify staff access.' });
    const profiles = await profileRes.json();
    if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].role !== 'staff') {
      return res.status(403).json({ error: 'Only TBS staff can send invoices.' });
    }
  } catch {
    return res.status(503).json({ error: 'Session verification is unavailable.' });
  }

  const { to, subject, text, pdfBase64, filename } = req.body || {};

  if (!to || !subject || !pdfBase64) {
    res.status(400).json({ error: 'Missing required fields (to, subject, pdfBase64).' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server.' });
    return;
  }

  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        attachments: [
          {
            filename: filename || 'invoice.pdf',
            content: pdfBase64,
          },
        ],
      }),
    });

    const data = await resendRes.json();

    if (!resendRes.ok) {
      res.status(resendRes.status).json({ error: data.message || data.error || 'Resend rejected the request.' });
      return;
    }

    res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
}

