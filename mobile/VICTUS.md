# Victus: water widgets (PT / EN)

## Included

- Four original brand-derived illustrations shared by web, iPhone and Android.
- Water page: configured drink buttons, other drink dialog, progress and time-aware expression.
- Native widgets: configured first two drink shortcuts (one on small iPhone), More deep link,
  and undo for the latest pending entry that has not started syncing.
- Add widget button: Android requests system pinning if the launcher supports it; iPhone shows
  instructions. A request is never reported as a successful installation.
- Both languages follow the app setting, including drink labels. Before first sync native gallery
  metadata follows the system language; onboarding text is bilingual on iOS.

## Honest sync contract

Widgets persist a local outbox without needing the WebView or internet. **Server synchronization
requires opening/resuming the app.** This version does not claim background cloud synchronization.
The native widget shows pending entry count and prompts opening the app. It retains the last known
goal and shortcuts across midnight and prompts refreshing the goal on a new day. It does not invent
today's automatic target offline. All widget instances share the same outbox on that device.

No passwords, Supabase tokens, refresh tokens or service keys are stored in the widget. Foreground
sync uses the signed-in web session and existing RLS. Migration `0014_victus.sql` adds nullable UUID
event identifiers and a unique `(user_id, client_event_id)` index so retries do not duplicate entries.
It leaves existing rows and access policies unchanged. The original date/time/factor travel with
each pending event; web and native count effective ml using the existing app configuration.

The snapshot and outbox are updated together under a cross-process file lock on iOS, and a
synchronized SharedPreferences transaction on Android. Acknowledgement removes only IDs whose
server insertion completed; newer taps remain pending. Entries marked attempted cannot be undone
in the widget while their network result is uncertain; after sync use the app's existing delete
action. Queue capacity is 200. Open the app to synchronize before adding further entries.

Logout clears the local widget. Switching accounts discards the previous account's local snapshot
and pending entries rather than assigning them to the new account. **Open the app to sync before
logging out or switching accounts.** Account deletion clears the widget. Revocation on another
device cannot remotely erase an offline widget; its last cached state remains until app refresh.
Android excludes the snapshot/outbox from cloud backup and device transfer. iOS uses the App Group
container with data protection until first unlock, and marks widget content privacy-sensitive.

## Mood rules

Same rules in TypeScript, Swift and Java:
- At/above 100%: happy. No additional reward for exceeding the goal.
- At/above 75%: encouraging.
- Outside configured weekdays or before start + 30 minutes: sleepy (unless goal already reached).
- Otherwise compare progress to elapsed fraction of the configured start/end window; more than
  15 percentage points behind: playfully grumpy, otherwise encouraging.
- Default window: 09:00–21:00, even when notifications are off. Mood is encouragement, not a
  medical assessment of hydration. Native system refresh schedules are best effort, not real-time.

## Prepare and release

1. Apply `supabase/migrations/0014_victus.sql` using the normal reviewed database deployment process.
   Without it, foreground outbox sync fails safely and keeps pending entries.
2. Deploy the web changes, then build new native apps. Existing mobile builds continue working
   without the new plugin; Add widget asks users to update.
3. In `mobile/`: `npm install --install-links`. Android: `npm run android:prepare`, then build with
   Android Studio / Gradle (JDK 21 and an appropriate Android SDK).
4. iOS: create Apple App Group `group.com.zamoriane.takingcare`. Enable it for BOTH app identifier
   `com.zamoriane.takingcare` and new extension identifier `com.zamoriane.takingcare.VictusWidget`.
   Regenerate provisioning profiles for both. The extension requires iOS 17+ for interactive buttons.
5. `sh scripts/prepare-ios.sh` generates the extension, shared resources, App Group entitlements
   and the `takingcare://agua` URL scheme. It preserves the existing Google URL scheme. Run it
   after each Capacitor regeneration. Codemagic signing now matches app and extension identifiers.
6. Use the draft PR's unsigned native compile checks before any TestFlight or store release.
   No new tag or publishing action is part of this change.

Artwork is committed as SVG/PNG. To regenerate after changing the vector design, run
`node mobile/scripts/generate-victus.mjs` from the repo root (root dependencies include Sharp
through Next.js). It does not need an image generation service.

## Validation before release

- Add small/medium iPhone widgets and resizable Android widget; exercise platform font scaling.
- PT → EN → PT and custom cup types/volumes, including tea's existing hydration factor.
- Tap with WebView closed, reopen and ensure exactly one server row per UUID.
- Retry after offline, missing migration, partial failure and app termination during sync.
- Undo before opening; ensure no undo races with submitted entries.
- Simultaneous taps from two widget instances; a new tap during server acknowledgement.
- Midnight, timezone changes, current and previous day entries, manual/automatic goal changes.
- Logout, account switch, deleted/disabled user; verify no records go to a different account.
- Android pin request accepted, dismissed and unsupported; iOS instructions on actual iOS versions.
- Verify reminders are rescheduled on foreground sync and stop for today when goal is reached.
- Builds and device tests are still required: passing web tests is not native widget validation.

Rollback: revert the application changes and retain the additive nullable database column/index.
Do not drop the column while queued native entries could still need idempotent synchronization.
