# Play Console: foreground-service declarations (tasks 4.1)

Text to paste into **Play Console → App content → Foreground service
permissions** for `app.azula`. Nothing has been uploaded or submitted. Play
asks, for each foreground-service type the app uses, what the functionality
is, what happens if the task is deferred or interrupted, and for a video link.
The declaration covers the two `specialUse` services below; `dataSync`
(`IrohService`, the message connection) is already declared and unchanged.

Facts checked on 2026-11-23:
- `targetSdk: 36` (`android-app/module.yaml`; the manifest's
  `foregroundServiceType` values match).
- Both services declare `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` (the strings are
  quoted at the end).

## 1. Hosting (`dev.azula.vmhost.HostService`, process `:vmhost`)

**What the app does with it.** The user turns on "host compute on this phone"
in azula's settings, after a one-time, user-driven permission step. While
hosting is on, the service runs one Linux virtual machine (the Android
Virtualization Framework) and azula's broker, which carries commands from the
user's own remote coding sessions to that VM. Commands arrive over an
end-to-end encrypted connection, only from sessions the user has given a
token, and each token can be revoked in the app. The service shows an ongoing
notification with the hosting state and a **Stop** action. It runs only while
the user keeps hosting on.

**Why no other type fits.** The work is a long-lived, user-visible virtual
machine, not a data transfer, a media session, a location task or a connected
device. No foreground-service type describes hosting a virtual machine.

**If the system defers the task.** The VM doesn't start when the user turns
hosting on, so their remote sessions have no machine to run on. The user sees
it as hosting that won't start.

**If the system interrupts it.** The VM stops and running commands are cut
off; azula reports them as interrupted after the next start. Nothing in the
phone's other apps is affected, and the user restarts hosting from the app.

## 2. One-time permission setup (`dev.azula.selfgrant.SelfGrantService`)

**What the app does with it.** The first time the user sets up hosting, azula
needs two Android permissions that only the phone's owner can grant, through
Wireless debugging. The user starts this setup in the app, turns on Wireless
debugging, and pairs azula by typing the code the phone shows into azula's
notification. azula then grants itself the two permissions and tells the user
it's done. The service exists only to wait for that code and finish the
grant. It stops on success, on failure, if the user cancels, or after 10
minutes without activity.

**Why no other type fits.** It waits, briefly, for a code the user is typing
in another app's screen. There's no network transfer, media or location work
to declare.

**If the system defers the task.** The code prompt doesn't appear in time. The
pairing screen in Settings closes when the user leaves it, so the setup has to
start again.

**If the system interrupts it.** The setup resumes at the same step when
azula is opened again. No data is lost, and the app has no other effect.

## Video

Play wants a link to a video that shows the steps a user takes to trigger each
feature, so it shows both the grant and the hosting service.
- **Draft (2026-11-23):** about 83 s, built from the 3.7 recording, with the
  Wi-Fi name, router address, mDNS names and Mac hostname masked. It still
  shows the old "about 4 min" copy.
- **Final:** re-recorded on the build that ships, then masked with the same
  script (`demo/make-demo.sh`, kept with the recordings, not in the repo).
- The link itself has to be made by Sal, for example an unlisted video.

Shot list, in order:
1. Settings → "host compute on this phone" → **set up**.
2. The permission steps: Wireless debugging, the pairing code, and the code
   typed into azula's notification. The grant completes.
3. The setup runs to **Ready**, with the ongoing notification.
4. **Connect a cloud session**, then the notification's **Stop** action.

## Other declarations the release needs

- **Data safety:** unchanged by hosting, because the VM's contents and tokens
  stay on the device and no data is sent to azula's servers. (Review this
  against the form when filing.)
- **Permissions:** `MANAGE_VIRTUAL_MACHINE` and `USE_CUSTOM_VIRTUAL_MACHINE`
  are declared in the manifest but granted only by the owner's explicit
  Wireless-debugging step. They're outside the Play permissions declaration
  form's list, and they're not runtime permissions.
- **Device and Network Abuse:** the app downloads a Debian cloud image and runs
  it inside a virtual machine. See D8 in `design.md`.

## The manifest strings (for reference)

| Service | `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` |
|---|---|
| HostService | "Hosts a user-started Linux virtual machine that runs commands sent by the user's own remote coding sessions; runs only while the user keeps hosting on, with a persistent notification and a Stop action." |
| SelfGrantService | "One-time, user-started setup that grants this app its own virtual machine permissions through Wireless debugging pairing; runs only until the grant finishes." |

## Sources

- [Understanding foreground service and full-screen intent requirements (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/13392821)
- [Foreground service types (Android Developers)](https://developer.android.com/develop/background-work/services/fgs/service-types)
