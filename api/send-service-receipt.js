// Authorized payment receipt delivery for TBS staff and the matching client portal.
// Recipient is loaded server-side from the payment's Services record (or employee).
// The browser may only supply a service ID and an already-rendered PDF.
import { normalizeReceiptEmail, isValidReceiptEmail } from '../src/tbsServiceReceiptEmail.js';

const reply = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed.' });
  }

  const auth = req.headers?.authorization || '';
  const token = typeof auth === 'string' && /^Bearer\s+\S+$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '') : '';
  if (!token) return reply(res, 401, { error: 'Sign in to send a payment receipt.' });

  const { serviceId, pdfBase64 } = req.body || {};
  if (typeof serviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(serviceId)) {
    return reply(res, 400, { error: 'Valid Services payment ID required.' });
  }
  if (typeof pdfBase64 !== 'string' || pdfBase64.length < 30 || pdfBase64.length > 7_200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
    return reply(res, 400, { error: 'Valid payment receipt PDF required (maximum 5 MB).' });
  }
  const pdf = Buffer.from(pdfBase64, 'base64');
  if (pdf.length === 0 || pdf.length > 5 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') {
    return reply(res, 400, { error: 'The attachment must be a PDF (maximum 5 MB).' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !key || !resendKey) return reply(res, 503, { error: 'Payment email service is not configured.' });
  const headers = { apikey: key, Authorization: `Bearer ${token}` };

  try {
    const accountRes = await fetch(`${url}/auth/v1/user`, { headers });
    if (!accountRes.ok) return reply(res, 401, { error: 'Your session expired. Sign in again.' });
    const user = await accountRes.json();
    if (!user?.id) return reply(res, 401, { error: 'Invalid session.' });

    async function rows(path) {
      const response = await fetch(`${url}/rest/v1/${path}`, { headers });
      if (!response.ok) throw new Error('Database verification failed.');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid database response.');
      return data;
    }

    const profiles = await rows(`profiles?select=role,client_id&id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const profile = profiles[0];
    if (!profile || !['staff', 'client'].includes(profile.role)) {
      return reply(res, 403, { error: 'Payment receipt access is not permitted.' });
    }
    const services = await rows(`services?select=id,client_id,employee_name,service_date,resource_type,email&id=eq.${encodeURIComponent(serviceId)}&limit=1`);
    const service = services[0];
    if (!service) return reply(res, 404, { error: 'Services payment was not found or is inaccessible.' });
    if (profile.role === 'client' && (!profile.client_id || profile.client_id !== service.client_id)) {
      return reply(res, 403, { error: 'This payment belongs to another client.' });
    }

    let recipient = normalizeReceiptEmail(service.email);
    if (!recipient && service.resource_type === 'employee') {
      const employees = await rows(
        `employees?select=email&client_id=eq.${encodeURIComponent(service.client_id)}&name=eq.${encodeURIComponent(service.employee_name)}&limit=1`
      );
      recipient = normalizeReceiptEmail(employees[0]?.email);
    }
    if (!recipient || !isValidReceiptEmail(recipient)) {
      return reply(res, 409, { error: 'Enter a valid recipient email in Services and save the payment first.' });
    }

    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'onboarding@resend.dev',
        to: [recipient],
        subject: `Payment Receipt — ${service.service_date}`,
        text: `Hello ${service.employee_name},\n\nAttached is your Services payment receipt dated ${service.service_date}.\n\nFor any questions, please contact your business administrator.\n`,
        attachments: [{ filename: `Services_Receipt_${service.service_date}.pdf`, content: pdfBase64 }],
      }),
    });
    const data = await sent.json().catch(() => ({}));
    if (!sent.ok) return reply(res, 502, { error: data.message || 'The email provider rejected this request.' });
    return reply(res, 200, { success: true, to: recipient, id: data.id || null });
  } catch {
    return reply(res, 503, { error: 'Payment receipt email is temporarily unavailable.' });
  }
}
