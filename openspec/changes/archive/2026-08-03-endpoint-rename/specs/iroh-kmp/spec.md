# iroh-kmp Delta

## MODIFIED Requirements

### Requirement: Transport surface tracks the iroh crate
While at v0.x the SDK SHALL name its surface after the `iroh` crate it wraps rather than hold a name stable for compatibility, so a rename in iroh may be followed by a breaking rename here. Behavior-preserving additions SHALL remain purely additive; a rename SHALL bump the minor version and SHALL land together with the azula-app change that adopts it, so no consumer is left on a half-migrated surface.

#### Scenario: iroh renames part of the API this SDK wraps
- **WHEN** a new iroh release renames a type or method the SDK exposes (as iroh
  1.0 renamed node → endpoint: `EndpointAddr`, `Endpoint::id`, `Endpoint::addr`)
- **THEN** the SDK SHALL adopt the new name rather than translate back to the old
  one, bump its minor version, and land the azula-app call-site update in the
  same pass

#### Scenario: Adding new core-iroh API surface
- **WHEN** new core-iroh functionality (e.g. `IrohConnection`, `bind_with`,
  datagrams) is added to the SDK
- **THEN** the addition SHALL be purely additive, and azula-app/shared SHALL
  recompile unchanged against the existing transport surface

## REMOVED Requirements

### Requirement: Backward-compatible transport surface
**Reason**: falsified by `iroh-kmp` 0.2.0, which deliberately renamed the transport surface to match iroh's 1.0 vocabulary.

The removed requirement read: the SDK SHALL preserve the original azula transport
surface (`IrohEndpoint.bind`, `nodeId()`, `secretKeyBytes()`, `myTicket()`,
`connect()`, `acceptNext()`, `shutdown()`, `sign()`,
`IrohStream.sendBytes/recv/finish`, `rttMs()`, and the ticket/signature free
functions) byte-for-byte in signature and observable behavior across SDK changes.

Its additive-change scenario is preserved verbatim in the replacement above; only
the byte-for-byte naming guarantee is dropped.
