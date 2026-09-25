// api/send-invoice.js — VERSIÓN TEMPORAL DE DIAGNÓSTICO
// (después de confirmar el problema, hay que volver a poner la versión real)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({
      diagnostic: true,
      has_RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      RESEND_API_KEY_length: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.length : 0,
      has_RESEND_FROM: !!process.env.RESEND_FROM,
      RESEND_FROM_value: process.env.RESEND_FROM || null,
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
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
