# Media transfer — streamed images / audio / video

Peer-to-peer media attachments without base64 bodies: the sender **offers**
metadata on the chat stream, the receiver **pulls** the bytes on demand over a
dedicated ALPN, streaming to disk with progress and resume. Applies to
`ConversationKind.PEER` conversations only — LLM conversations keep the legacy
inline `file_begin` path (`ChatService.sendFile`), which also remains the
wire-compatible fallback for old peers.

## Wire design

**Offer (chat stream, `azula/chat/0`)** — `Frame.MediaOffer`
(`azula-app/network-api/src/dev/azula/net/Protocol.kt`, mirrored in
`azula-cli/src/proto.rs`):
`{type:"media_offer", id, kind: image|audio|video|file, name, mime, size,
caption?, width?, height?, durationMs?, thumbB64? (≤32 KiB jpeg), fetchTicket}`.
`fetchTicket` is the **sender's own fresh `transport.myTicket()`** — this is
what lets a receiver who *accepted* the chat connection (and so has no ticket
for the peer) dial back. azula-cli never accepts the CHAT ALPN, so this frame
structurally never reaches it; its `Frame` enum still mirrors the variant and
has a `#[serde(other)] Unknown` catch-all so genuinely unknown frame types no
longer tear down Rust streams.

**Fetch (`Alpns.MEDIA = "azula/media/0"`)** — one connection per fetch (the
iroh-kmp SDK exposes one bi-stream per `connect()`; a sibling-stream FFI is
future work). `MediaProtocol.kt` defines the mini-protocol, deliberately
outside the mirrored `Frame` hierarchy:
1. receiver → `{"id","offset"}` (offset = bytes already on disk → resume),
2. sender → `{"type":"ok", id, size, offset}` or `{"type":"error", id, reason}`,
3. raw binary body, `MEDIA_CHUNK` (256 KiB) chunks via `sendBytes`/
   `receiveBytes` loops (never one whole-body read — `LineBuffer.readBytes(n)`
   would buffer all n), sender closes at end; receiver stops at `size` bytes.

`Alpns.MEDIA` is in the **bind set only** (`ConnectService.start`), never in
`Alpns.ALL`'s dial-race. Inbound media connections route to
`MediaService.serveIncoming` before any conversation handling.

## Storage — BlobStore

`persistence-api/src/dev/azula/persist/BlobStore.kt`: `exists/sizeOnDisk/
openWriter (appends from current size)/openReader(offset)/pathFor/delete`.
Implementations: `FileBlobStore` (`src@jvmAndAndroid`, RandomAccessFile,
`<base>/blobs/<sanitized-id>`; jvm base `~/.azula`, android `context.filesDir`)
and `NsFileManagerBlobStore` (`src@ios`, NSDocumentDirectory/`azula-blobs/` —
the first file-based store on iOS; message history itself still lives in
NSUserDefaults, unchanged). `mock-support` has `InMemoryBlobStore`, wired into
`buildMockState` so `-mock` apps can send/receive media.

Message JSON stays small: blob-backed `AttachmentDto` rows carry `blobId` +
metadata + `thumbB64`, never body bytes. Legacy `bytesB64` rows still decode
(all new DTO fields default). Persisted `state` is advisory only —
`PersistenceCoordinator.restoreAll` reconciles blob-backed attachments from
disk truth (`sizeOnDisk` vs `size` → Complete / Downloading-paused / Offered),
so killing the app mid-download restarts as "tap to resume" with no special
recovery code.

## Auto-export received media to device storage

Every **received** blob is auto-saved to user-visible storage the moment it
reaches `TransferState.Complete`, so the user can re-view/share it outside Azula.
The seam is `MediaExporter` (`persistence-api/.../MediaExporter.kt`):
`suspend fun export(path, name, mime): String?` — mime-string based (no `MediaKind`
in the signature) so `shared` needs only a mime; the impl classifies
image/video/audio/other itself and returns a display location ("Photos",
"Downloads/foo.pdf") or null. It's a nullable `@Provides` on `AppGraph.Factory`
(null = no export, e.g. the `-mock` apps), injected into `MediaService`.

Per-platform actuals (`persistence-real`, + the Android app module for the
`Context`): **JVM** copies into `~/Downloads/Azula/` (collision-safe `name (1).ext`);
**Android** (`AndroidMediaExporter(context)`) does scoped-storage `MediaStore`
inserts — image/video → gallery (`Pictures`/`Movies/Azula`), audio/other →
`Download/Azula` — with an API 26–28 `getExternalStoragePublicDirectory` +
`MediaScannerConnection` fallback (needs `WRITE_EXTERNAL_STORAGE maxSdkVersion=28`);
**iOS** adds image/video to the Photos library via `PHAssetCreationRequest`
(`NSPhotoLibraryAddUsageDescription`), audio/other into `Documents/Azula/`
(`UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` → visible in
Files.app). Auto-save is prompt-free apart from the one-time iOS Photos grant.

Export fires **exactly once, received-only**, at the two Complete transitions in
`MediaService`: `runFetch`'s success branch (streamed PEER media — sends never
call `runFetch`) and `ingestLocalBlob` when `role == Role.THEM` (legacy/LLM files
from `ConnectService.receiveLoop`'s FileBegin branch — not re-triggered in
ConnectService, to avoid double-export). It's fire-and-forget on the service scope
and best-effort: a null exporter, a missing on-disk path (`blobPath == null`, e.g.
the in-memory mock store), or a failure are all silently ignored and never block
or fail the transfer. Sends (`Role.ME`) are structurally excluded.

## State machine + services

`Attachment` (core, Compose-free) carries `kind: MediaKind`, `blobId`,
`fetchTicket`, `thumbBytes`, and `state: TransferState`
(Complete | Offered | Downloading(done,total) | Failed(reason)). Progress
publishes by replacing the `Message` in `ConversationState.messages`
(the token-streaming pattern), throttled to ~150 ms.

`MediaService` (`shared/src/dev/azula/state/MediaService.kt`, the ninth
state-layer service — see `architecture-di.md`):
- `sendMedia` — cap check (rejections append a local Failed placeholder so the
  fire-and-forget caller still sees feedback), blob write, image thumbnail via
  `scaleImageForAvatar`, ME message, async ticket resolution, best-effort offer.
- `onMediaOffer` — placeholder message; auto-fetch images always, other kinds
  when `size <= AUTO_DOWNLOAD_THRESHOLD` (20 MB const in MediaService.kt);
  oversize offers (> `MAX_MEDIA_BYTES`, 512 MiB) appear as Failed("too large").
- `startFetch`/`cancelFetch` — resumable, cancellable; the in-flight registry
  is claimed atomically and a successor fetch joins a cancelled predecessor's
  cleanup, which deregisters only itself (prevents state clobber/lost-job races).
- `serveIncoming` — stateless per-request blob serving with offset validation.

## UI

`Chat.kt`: attach menu (Photo/Video/Audio via `rememberMediaPicker`, PEER
only; File = legacy path), composer preview strip + caption, `AttachmentView`
dispatch per kind/state (thumb → fullscreen overlay for images; poster+play →
overlay `VideoPlayer` for video; inline `rememberAudioPlayer` bar for audio;
download/progress-ring/cancel/retry chrome). Fullscreen viewer =
`AzulaState.fullscreenMedia` + a root overlay in MobileApp/DesktopApp (no
MScreen case). Players: android VideoView/MediaPlayer (zero deps), iOS
AVPlayer/AVAudioPlayer (UIKit interop — see `shared/src@ios/dev/azula/ui/`),
desktop = poster + open-in-system-player, WAV-only inline audio (deliberate).
Pickers: `MediaPicker.kt` expect/actuals; iOS uses PHPickerViewController /
UIDocumentPickerViewController (`PickerInterop.ios.kt` — the repo's first
UIKit presentation; PHPicker needs no Info.plist permission).

## Threat model / accepted gaps

- Served blobs have no ACL/expiry: any peer holding an offer's UUID can
  re-fetch while the blob exists. IDs are unguessable and travel only over the
  encrypted chat stream to the intended peer. No revoke-on-delete.
- `fetchTicket` goes stale if the sender's identity rebinds (recovery-phrase
  import) — the fetch fails; re-sending re-offers.
- Android backgrounding tears down the endpoint (pre-existing) — in-flight
  fetches die and resume on retry.
- Verified on the iOS 26.5 simulator via `azula-app/e2e/ios-media.yaml`
  (Maestro): PHPicker → pick → preview → send → bubble. Pickers must present
  ~400 ms AFTER the attach menu closes — Compose hosts popups in a transient
  presented view controller, and presenting from it tears the picker down with
  the menu (`PickerInterop.ios.kt`, `presentAfterPopupTeardown`). Still
  unverified: AVPlayer embedding, inline audio bar, real-device HEIC. See
  tech-debt.md.

## Testing

- `network-api/test/MediaProtocolTest.kt` — frame/protocol round-trips, chunk +
  resume math, EOF handling (11 tests).
- `persistence-real/test@jvm/FileBlobStoreTest.kt` — write/resume/read/delete (7).
- `mock-support/test/MediaServiceTest.kt` — auto-download, threshold,
  cancel→resume offset, oversize rejection, restart reconciliation, send
  round-trip (6), over `FakeTransport`'s media-ALPN fake + `InMemoryBlobStore`.
- azula-cli `proto.rs` tests — media_offer mirroring + Unknown catch-all.
- Manual: two `jvm-app-mock` instances exercise the full flow via the fake.
