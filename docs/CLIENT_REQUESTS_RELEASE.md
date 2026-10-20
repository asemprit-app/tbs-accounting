# Client Requests — Production release

Scope: add the existing secure request/message/private-document portal and registered-client email notification to the regular application. Rename Monthly Close / Review Queue to remove 'internal pilot'. Leave Client Health Score excluded.

## Important
- The previous verified Resend delivery test exercised invoice emails, **not Client Requests**. This release adds its own notification endpoint and needs one operational send test with authorized recipient after deployment.
- Request creation is staff-only via RLS; client roles read requests for their linked business and can reply/upload privately under existing Supabase policies.
- Backend derives recipients from Supabase Auth profiles linked to the request's business; the browser cannot choose addresses. The request's confidential content is NOT included in email.
- If email service rejects sending, the request remains saved and staff sees a clear warning.
- A normal successful Resend response confirms provider acceptance, not inbox delivery.
- Do not publish Health Score; do not change accounting tables or permissions.
