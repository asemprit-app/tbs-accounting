import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server is missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing staff access token.' });

  const { email, password, clientId } = req.body || {};
  if (!email || !password || !clientId) return res.status(400).json({ error: 'Email, password and clientId are required.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData?.user) return res.status(401).json({ error: 'Invalid staff session.' });

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .single();
  if (callerProfileError || callerProfile?.role !== 'staff') return res.status(403).json({ error: 'Only TBS staff can create client access.' });

  const { data: targetClient, error: clientError } = await admin.from('clients').select('id,name').eq('id', clientId).single();
  if (clientError || !targetClient) return res.status(404).json({ error: 'Client Workspace not found.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  let targetUser = null;
  let mode = 'created';

  const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return res.status(500).json({ error: listError.message });
  targetUser = (listData?.users || []).find(u => (u.email || '').toLowerCase() === normalizedEmail) || null;

  if (targetUser) {
    const { data: existingProfile } = await admin.from('profiles').select('role,client_id').eq('id', targetUser.id).maybeSingle();
    if (existingProfile?.role === 'staff') return res.status(409).json({ error: 'That email belongs to a staff account and cannot be converted to client access.' });
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(targetUser.id, { password, email_confirm: true });
    if (updateAuthError) return res.status(400).json({ error: updateAuthError.message });
    mode = 'updated';
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });
    if (createError || !created?.user) return res.status(400).json({ error: createError?.message || 'Could not create user.' });
    targetUser = created.user;
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: targetUser.id,
    role: 'client',
    client_id: clientId,
  }, { onConflict: 'id' });
  if (profileError) return res.status(400).json({ error: 'User was created, but the profile could not be linked: ' + profileError.message });

  return res.status(200).json({
    ok: true,
    mode,
    userId: targetUser.id,
    email: normalizedEmail,
    clientId,
    clientName: targetClient.name,
  });
}
