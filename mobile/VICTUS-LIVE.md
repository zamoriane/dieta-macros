# Victus Live Activity

Water presents a one-time PT/EN choice: activate Victus or not now, stored per
account in the App Group. Disable it in Water or iOS Settings. This app choice
is separate from notification permission; it does not simulate an OS dialog.

iOS 17 supports starting in the foreground during reminder hours. iOS 17.2+
supports APNs push-to-start. One start per installation/day is intended;
foreground/remote requests can race, so native refresh also removes duplicates.
iOS controls delivery, visibility and the eight-hour maximum.

## Deployment order

1. Apply supabase/migrations/0015_victus_live_consent.sql after 0014.
2. Enable Push Notifications for com.zamoriane.takingcare in Apple Developer.
   Regenerate the main App Store provisioning profile and replace its old copy
   in Codemagic. Preserve App Groups on both targets.
3. Configure Production-only server variables in Vercel: APNS_KEY_ID,
   APNS_TEAM_ID, APNS_PRIVATE_KEY (complete .p8 PEM), CRON_SECRET and
   VICTUS_APNS_ENABLED=false. Never prefix secrets with NEXT_PUBLIC_.
4. Merge/deploy this code and build a new signed iOS app through Codemagic.
   A web deployment cannot add native functionality or signing entitlements.
5. Configure a scheduler to GET /api/cron/victus every minute, authenticated
   with Authorization: Bearer <CRON_SECRET>. Use a plan/service supporting that
   frequency. This PR does not change vercel.json; a route alone is not a
   schedule. Never put the secret in the URL.
6. Once those steps are complete, set VICTUS_APNS_ENABLED=true and deploy again.
   Open the new TestFlight build, accept Victus, enable water reminders and
   verify registration before testing a future reminder with the app closed.

APNs uses production, suitable for TestFlight/App Store with a production key.
Unsigned CI/simulator builds cannot validate APNs delivery. Do not enable
preview sends or use development device tokens. Variable changes require a new
deployment. Rollback: set the flag false and redeploy; local notifications and
foreground activities remain usable.

## Scheduling and data

The app registers the first eligible reminder of each of the next three days.
Registration expires after three days without opening/syncing. The server
rechecks account status, reminder settings, cloud goal completion and recent
drinks. Offline drinks cannot be checked remotely. Automatic goals and cups
remain cached until app sync.

A database claim prevents concurrent cron requests from sending twice per
installation/day. Claims remain consumed after ambiguous APNs failures; no
automatic retry risks duplicate starts. Missed slots older than five minutes
are skipped. Each invocation sends at most five starts; monitor capacity before
expanding usage. APNs HTTP 200 means acceptance, not proof of display.

The push carries an account identifier and initial activity attributes, not
hydration history. The visible card reads the App Group and checks owner,
consent and expiry. A queued push arriving after logout/revocation shows only a
generic link. Online revocation clears the server token; offline revocation
cannot recall a push already queued by Apple.

Drink actions use the UUID outbox and hydration factors. Entries show locally
and sync on app foreground. Goal completion ends the activity. Old-account
actions are rejected. Android retains its home widget and local notifications.

## Device release checks

- PT/EN acceptance, not now, persistence after restart, disable/re-enable.
- iOS Settings denied; upgrade guidance on an old native build.
- TestFlight remote start at a future slot, app closed and screen locked.
- Lock Screen and all Dynamic Island sizes, text size and contrast.
- Drink factors, offline outbox and one cloud row after reopening.
- Goal completion, logout/account switch, midnight, expiry/system dismissal.
- No restart on every foreground sync or repeated cron invocation.
- Disabled reminders/account, recent drink and reached goal suppress sends.
- Local notifications work with remote feature disabled.

CI compiles unsigned iOS and Android and checks scheduling/SQL claims.
Actual APNs delivery and signed-device validation remain release requirements.

