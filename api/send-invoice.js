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
