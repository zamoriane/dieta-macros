# Victus Live Activity (iOS 17+)

In Water, choose Start Live Activity. The app must be open, Live Activities must
be enabled in iOS Settings, and today's synced goal must still be incomplete.
The card appears on the Lock Screen and on supported iPhones in Dynamic Island.
End Live Activity removes it. No new certificate, App Group or database migration
is needed: this uses the existing Victus extension and shared container.

This is a foreground-started ActivityKit integration, not a scheduled alert.
There is no APNs push-to-start server or background timer. Existing local water
notifications are unchanged. iOS controls visibility and limits active duration
to eight hours; the UI becomes stale at midnight or expiry and rejects old actions.
Updates arrive when the app syncs or a native drink/undo action runs. A time-based
mood is recalculated on those updates, not continuously while the app is closed.
Automatic goals remain cached until the app syncs.

Configured cup actions use the existing UUID outbox and hydration factors.
Pending entries appear locally immediately and sync to Supabase on app foreground.
Goal completion ends the activity with a short final celebration. Logout/account
switch clears the visible activity; a new account must start its own activity.
The system may retain an ended or stale card according to its own lifecycle rules.

## Release validation on a device

- Install a new native build, enable Live Activities, start from Water in PT and EN.
- Verify start/end, denied permission and the upgrade hint in an old native build.
- Verify Lock Screen, compact/minimal/expanded Island, text size and contrast.
- Log each configured drink; verify volume/factor, local progress and one cloud row.
- With the app offline/closed, log drinks then reopen online and check no duplicates.
- Log/undo from the home widget and verify the running Live Activity refreshes.
- Reach goal, log out, switch account, cross midnight and dismiss via system UI.
- Confirm no old-account content/actions remain after logout or account switch.
- Verify ordinary hydration notifications still follow the configured schedule.

No Android Live Activity equivalent is included in this change; Android retains
the existing widget and local notifications.
