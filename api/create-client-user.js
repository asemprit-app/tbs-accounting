import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function safeErrorMessage(err) {
  if (!err) return 'Unknown error.';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

  // Prefer Supabase's current server-side secret key.
  // Keep the legacy service_role variable as a fallback for existing deployments.
  const adminKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  const keyType = process.env.SUPABASE_SECRET_KEY
    ? 'secret'
    : (process.env.SUPABASE_SERVICE_ROLE_KEY ? 'legacy_service_role' : 'missing');

  // Safe health check. It validates the admin key without exposing it.
  if (req.method === 'GET') {
    let supabaseHost = '';
    try {
      supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : '';
    } catch {
      supabaseHost = 'INVALID_URL';
    }

    if (!supabaseUrl || !adminKey || supabaseHost === 'INVALID_URL') {
      return json(res, 200, {
        ok: false,
        service: 'create-client-user',
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasAdminKey: Boolean(adminKey),
        keyType,
        supabaseHost,
        adminKeyValid: false,
      });
    }

    try {
      const admin = createClient(supabaseUrl, adminKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Harmless server-side call that requires a valid elevated key.
      const { error: validationError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });

      return json(res, 200, {
        ok: !validationError,
        service: 'create-client-user',
        hasSupabaseUrl: true,
        hasAdminKey: true,
        keyType,
        supabaseHost,
        adminKeyValid: !validationError,
        validationError: validationError ? validationError.message : null,
      });
    } catch (err) {
      return json(res, 200, {
        ok: false,
        service: 'create-client-user',
        hasSupabaseUrl: true,
        hasAdminKey: true,
        keyType,
        supabaseHost,
        adminKeyValid: false,
        validationError: safeErrorMessage(err),
      });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  let stage = 'environment';

  try {
    if (!supabaseUrl || !adminKey) {
      return json(res, 500, {
        error: 'Server is missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.',
        stage,
      });
    }

    try {
      new URL(supabaseUrl);
    } catch {
      return json(res, 500, {
        error: 'SUPABASE_URL/VITE_SUPABASE_URL is not a valid URL.',
        stage,
      });
    }

    stage = 'staff-session';

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return json(res, 401, { error: 'Missing staff access token.', stage });

    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const { email, password, clientId } = body;
    if (!email || !password || !clientId) {
      return json(res, 400, { error: 'Email, password and clientId are required.', stage: 'request-body' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const simpleEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!simpleEmailOk) {
      return json(res, 400, { error: 'Enter a valid client email address.', stage: 'request-body' });
    }

    if (String(password).length < 8) {
      return json(res, 400, { error: 'Password must contain at least 8 characters.', stage: 'request-body' });
    }

    stage = 'supabase-admin-client';

    const admin = createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    stage = 'verify-staff-user';

    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      return json(res, 401, {
        error: 'Invalid staff session: ' + (callerError?.message || 'user not found'),
        stage,
      });
    }

    stage = 'verify-staff-profile';

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .maybeSingle();

    if (callerProfileError) {
      return json(res, 500, {
        error: 'Could not read the staff profile: ' + callerProfileError.message,
        stage,
      });
    }

    if (callerProfile?.role !== 'staff') {
      return json(res, 403, {
        error: 'Only TBS staff can create client access.',
        stage,
      });
    }

    stage = 'target-client';

    const { data: targetClient, error: clientError } = await admin
      .from('clients')
      .select('id,name')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError) {
      return json(res, 500, {
        error: 'Could not read the Client Workspace: ' + clientError.message,
        stage,
      });
    }

    if (!targetClient) {
      return json(res, 404, { error: 'Client Workspace not found.', stage });
    }

    stage = 'find-auth-user';

    const { data: listData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return json(res, 500, {
        error: 'Supabase Auth could not list users. Verify the server admin key belongs to this same Supabase project: ' + listError.message,
        stage,
      });
    }

    let targetUser = (listData?.users || []).find(
      u => (u.email || '').toLowerCase() === normalizedEmail
    ) || null;

    let mode = 'created';
    let newlyCreated = false;

    if (targetUser) {
      stage = 'existing-profile-check';

      const { data: existingProfile, error: existingProfileError } = await admin
        .from('profiles')
        .select('role,client_id')
        .eq('id', targetUser.id)
        .maybeSingle();

      if (existingProfileError) {
        return json(res, 500, {
          error: 'Could not verify the existing user profile: ' + existingProfileError.message,
          stage,
        });
      }

      if (existingProfile?.role === 'staff') {
        return json(res, 409, {
          error: 'That email belongs to a staff account and cannot be converted to client access.',
          stage,
        });
      }

      stage = 'update-auth-user';

      const { error: updateAuthError } = await admin.auth.admin.updateUserById(
        targetUser.id,
        { password, email_confirm: true }
      );

      if (updateAuthError) {
        return json(res, 400, {
          error: 'Supabase Auth could not update this user: ' + updateAuthError.message,
          stage,
        });
      }

      mode = 'updated';
    } else {
      stage = 'create-auth-user';

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });

      if (createError || !created?.user) {
        return json(res, 400, {
          error: 'Supabase Auth could not create the user: ' + (createError?.message || 'Unknown create-user error.'),
          stage,
        });
      }

      targetUser = created.user;
      newlyCreated = true;
    }

    stage = 'link-profile';

    const { error: profileError } = await admin.from('profiles').upsert({
      id: targetUser.id,
      role: 'client',
      client_id: clientId,
    }, { onConflict: 'id' });

    if (profileError) {
      if (newlyCreated) {
        try {
          await admin.auth.admin.deleteUser(targetUser.id);
        } catch {
          // Best-effort cleanup.
        }
      }

      return json(res, 400, {
        error: 'The Auth user was created, but the client profile could not be linked: ' + profileError.message,
        stage,
      });
    }

    stage = 'verify-profile-link';

    const { data: linkedProfile, error: verifyProfileError } = await admin
      .from('profiles')
      .select('id,role,client_id')
      .eq('id', targetUser.id)
      .maybeSingle();

    if (verifyProfileError || !linkedProfile || linkedProfile.role !== 'client' || linkedProfile.client_id !== clientId) {
      return json(res, 500, {
        error: 'The user was saved, but the Client Workspace link could not be verified.',
        stage,
      });
    }

    return json(res, 200, {
      ok: true,
      mode,
      userId: targetUser.id,
      email: normalizedEmail,
      clientId,
      clientName: targetClient.name,
    });
  } catch (err) {
    return json(res, 500, {
      error: `Unexpected server error at ${stage}: ${safeErrorMessage(err)}`,
      stage,
    });
  }
}
