import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const OWNER_EMAIL = 'nsfida@khawrai.app';
const DOMAIN = 'khawrai.app';
const json = (status: number, payload: Record<string, unknown>) => new Response(JSON.stringify(payload), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) return json(500, { error: 'Admin-account function is not configured. Set the Supabase function secrets.' });

  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json(401, { error: 'A verified admin session is required.' });

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user || String(authData.user.email || '').toLowerCase() !== OWNER_EMAIL) {
    return json(403, { error: 'Only nsfida can create or manage admin accounts.' });
  }

  const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON request.' }); }
  if (body.action !== 'create') return json(400, { error: 'Unsupported action.' });

  const username = String(body.username || '').trim().toLowerCase();
  const displayName = String(body.display_name || '').trim().slice(0, 100);
  const password = String(body.password || '');
  const canRegistrations = body.can_registrations === true;
  // Project Funds belong to the owner (nsfida) only; managed admins can never receive this permission.
  const canFunds = false;
  const canResults = body.can_results === true;
  if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(username)) return json(400, { error: 'Username must be 2-40 characters and use letters, numbers, dots, underscores or hyphens.' });
  if (['nsfida', 'waseemfida'].includes(username)) return json(400, { error: 'This username is reserved for a built-in admin.' });
  if (password.length < 10) return json(400, { error: 'Use a temporary password with at least 10 characters.' });
  if (!displayName) return json(400, { error: 'Enter the admin display name.' });
  if (!canRegistrations && !canResults) return json(400, { error: 'Enable Registrations or Race results for this admin.' });

  const email = `${username}@${DOMAIN}`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, managed_by: 'nsfida' },
  });
  if (createError || !created.user) return json(400, { error: createError?.message || 'Could not create the auth account.' });

  const { error: rowError } = await service.from('marathon_admin_accounts').insert({
    email,
    display_name: displayName,
    can_registrations: canRegistrations,
    can_funds: canFunds,
    can_results: canResults,
    is_active: true,
    created_by: 'nsfida',
  });
  if (rowError) {
    // Roll back the just-created auth account if permissions could not be stored.
    await service.auth.admin.deleteUser(created.user.id);
    return json(500, { error: `Admin permissions could not be saved; the new login was rolled back. ${rowError.message}` });
  }
  return json(201, { ok: true, email, display_name: displayName, message: `Admin account ${email} created.` });
});
