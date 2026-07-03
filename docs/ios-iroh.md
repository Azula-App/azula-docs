# iOS: wiring the iroh Swift package

> **⛔️ OBSOLETE (2026-06) — superseded by the `iroh-kmp` SDK.**
> The Swift bridge described below has been **removed**: `SwiftTransportBridge.kt`
> and `IrohSwiftRegistry` no longer exist, `iosApp.swift` is simplified, and iOS
> gets iroh from the Kotlin/Native `app.azula.iroh:iroh-kmp` binding like the
> other platforms — no Swift package, no Xcode package dependency. Do **not**
> follow the steps below. See [`iroh-kmp.md`](iroh-kmp.md) for the current
> setup. The historical notes are kept for context only.

---

Kotlin/Native cannot call the `IrohLib` Swift package directly, so the iOS
transport is implemented in Swift and injected into the shared Kotlin code:

- Kotlin declares callback interfaces in
  `shared/src@ios/dev/azula/net/SwiftTransportBridge.kt`
  (`SwiftIrohTransport`, `SwiftP2pStream`, `IrohSwiftRegistry`).
- `IosIrohTransport` (`IrohTransport.ios.kt`) adapts those callbacks to the
  common suspend/Flow `IrohTransport`.
- `ios-app/src/iosApp.swift` implements them over `IrohLib` and registers an
  instance into `IrohSwiftRegistry.shared.impl` before Compose starts. If no
  implementation is registered, the app falls back to the demo transport.

## Add the package in Xcode

Open `ios-app/module.xcodeproj`, then:

1. **File ▸ Add Package Dependencies…** and paste
   `https://github.com/n0-computer/iroh-ffi`. Select the latest release and
   check **IrohLib** for the app target.
2. **Build Settings ▸ Other Linker Flags**: add `-framework Network` for both
   the `iphoneos` and `iphonesimulator` SDKs (required for interface
   enumeration).
3. Xcode 16 workaround: **Build Settings ▸ Enable Previews ▸ No**.

The package distributes prebuilt xcframeworks for device + simulator, so no Rust
toolchain is needed.

## Confirm the IrohLib signatures

`iosApp.swift` is written against the documented IrohLib surface (mirroring the
iroh 1.0 API: `Endpoint.bind`, `endpoint.connect`, `Connection.openBi/acceptBi`,
`SendStream.writeAll/finish`, `RecvStream.read`, `EndpointTicket.fromAddr/fromString`).
If the generated module differs (argument labels, async vs throwing), adjust the
bridge methods accordingly — the Kotlin side is agnostic to those details.

## Build

```bash
./kotlin build -m ios-app -p iosSimulatorArm64
```

Then run from Xcode on a simulator or device.
