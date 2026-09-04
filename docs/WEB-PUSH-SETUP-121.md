# Triplem VIP Web Push Reliability 121

Version 121 fixes a server-side subscription lookup regression discovered after version 120.

The Edge Function now reads authorized recipients' push subscriptions directly from `public.app_push_subscriptions` using the server-only Supabase service credential. Recipient authorization still occurs before this lookup. No browser subscription keys or VAPID secrets are exposed to clients.

No SQL migration is required after migration 120.

Redeploy only:

```powershell
npx.cmd supabase functions deploy push-notifications --no-verify-jwt
```

The updated source is `supabase/functions/push-notifications/index.ts`.
