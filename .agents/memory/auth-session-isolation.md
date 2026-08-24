---
name: Auth session isolation
description: Rules for keeping fast cached authentication isolated across login, logout, and in-flight requests.
---

Treat a login session as a generation: any asynchronous result may update client state only if the user and session generation still match the ones that launched it.

**Why:** Immediate cached-session restore and background data loading improve startup speed, but outstanding storage reads or API responses can otherwise revive a logged-out account or expose the previous account's state.

**How to apply:** Advance the generation on login, logout, and invalidation. Check it after every await before committing state, serialize credential storage writes, prevent stale token reads from overwriting newer writes, and scope request de-duplication to the active token.