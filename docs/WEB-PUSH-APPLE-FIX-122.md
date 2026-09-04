# Web Push Apple Compatibility Fix 122

Apple Web Push returned HTTP 400 `BadWebPushTopic` for iPhone Home Screen web-app subscriptions. Apple documents the Web Push `Topic` header as optional. Version 122 therefore omits the protocol-level Topic header only for `web.push.apple.com`, while preserving payload `tag`, VAPID authentication, TTL, urgency, encryption, and all existing Chrome/Edge behavior.

## Deployment

No SQL migration is required. Redeploy only:

`supabase/functions/push-notifications/index.ts`

Then run:

`npx.cmd supabase functions deploy push-notifications --no-verify-jwt`
