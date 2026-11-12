// Supervisor-only staff onboarding. Never accept a password in the request.
// The invite/recovery token goes only to the named staff mailbox via Resend.
import { createClient } from '@supabase/supabase-js';

const STAFF_EMAIL = 'admin@twelvestrategies.com';
const APP_URL = 'https://tbs-accounting.vercel.app';
const reply = (res, status, body) => res.status(status).json(body);

export function staffInvitationAllowed(profile) {
  return profile?.role === 'staff' && profile?.access_level === 'supervisor';
}
export function staffInviteTarget(email) {
  return String(email || '').trim().toLowerCase() === STAFF_EMAIL;
}
export function staffSetupRedirect() {
  return APP_URL + '/?setup=staff';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed.' });
  }
  const token = (String(req.headers?.authorization || '').match(/^Bearer\s+(\S+)$/i) || [])[1];
  if (!token) return reply(res, 401, { error: 'A supervisor session is required.' });
  if (!staffInviteTarget(req.body?.email)) {
    return reply(res, 400, { error: 'This invitation is limited to the approved TBS staff email.' });
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!url || !secretKey || !resendKey || !from) {
    return reply(res, 503, { error: 'Staff invitation email is not configured.' });
  }
  try {
    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !caller?.user?.id) {
      return reply(res, 401, { error: 'Please sign in again as supervisor.' });
    }
    const { data: supervisor, error: supervisorError } = await admin.from('profiles')
      .select('role,access_level').eq('id', caller.user.id).maybeSingle();
    if (supervisorError) return reply(res, 503, { error: 'Could not verify permissions.' });
    if (!staffInvitationAllowed(supervisor)) {
      return reply(res, 403, { error: 'Only the TBS supervisor may invite staff.' });
    }
    const { data: currentUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return reply(res, 503, { error: 'Could not inspect staff accounts.' });
    const existing = currentUsers?.users?.find(u => u.email?.toLowerCase() === STAFF_EMAIL);
    if (existing) {
      const { data: existingProfile, error: existingError } = await admin.from('profiles')
        .select('role,access_level').eq('id', existing.id).maybeSingle();
      if (existingError) return reply(res, 503, { error: 'Could not inspect the existing staff profile.' });
      if (existingProfile && (existingProfile.role !== 'staff' || existingProfile.access_level !== 'admin')) {
        return reply(res, 409, { error: 'The email already belongs to an account with a different role.' });
      }
    }
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: existing ? 'recovery' : 'invite',
      email: STAFF_EMAIL,
      options: { redirectTo: staffSetupRedirect() },
    });
    if (linkError || !linkData?.user?.id || !linkData.properties?.action_link) {
      return reply(res, 502, { error: linkError?.message || 'Could not create the secure invitation.' });
    }
    const { error: profileError } = await admin.from('profiles').upsert({
      id: linkData.user.id,
      role: 'staff',
      access_level: 'admin',
      client_id: null,
    }, { onConflict: 'id' });
    if (profileError) {
      return reply(res, 503, { error: 'The invitation was created, but the staff role could not be saved. Please retry.' });
    }
    const link = linkData.properties.action_link;
    const subject = existing ? 'TBS Accounting Engine | Establecer contraseña de acceso' : 'Invitación a TBS Accounting Engine';
    const message = 'Se ha autorizado su acceso como Administrador de Twelve Business Strategies LLC.\n\n' +
      'Para establecer su contraseña personal, abra este enlace seguro:\n' + link + '\n\n' +
      'El acceso incluye las funciones operacionales de TBS, excepto el Reporte Financiero Ejecutivo y CFO Close Overview.\n\n' +
      'Si no solicitó este acceso, ignore este correo.\n\nTwelve Business Strategies LLC';
    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [STAFF_EMAIL], reply_to: STAFF_EMAIL, subject, text: message }),
    });
    const sent = await mail.json().catch(() => ({}));
    if (!mail.ok) {
      return reply(res, 502, { error: sent.message || 'The email service rejected the invitation.' });
    }
    return reply(res, 200, { accepted: true, email: STAFF_EMAIL, deliveryId: sent.id || null });
  } catch {
    return reply(res, 503, { error: 'Staff invitation could not be completed.' });
  }
}
