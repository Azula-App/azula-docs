## ADDED Requirements

### Requirement: Pairing Completes a Handshake
`azula pair` SHALL complete a pairing handshake with the invite's issuer
rather than only recording the invite locally. It SHALL dial the issuer,
present the invite in its `Hello`, and wait a bounded interval for the issuer
to accept or decline, reporting progress while it waits.

The wait SHALL be bounded, and its bound SHALL be overridable by the caller.

The device SHALL be registered only when the issuer accepts. A decline, a
timeout, and an unreachable issuer SHALL each be reported distinctly and SHALL
exit non-zero per the CLI's exit-code convention, leaving no registry entry
behind. A timeout SHALL leave any pending request intact at the issuer, so
re-running `azula pair` with the same invite resumes rather than duplicating
it.

#### Scenario: Issuer accepts
- **WHEN** `azula pair <invite>` is run and the user approves the request on
  the issuing device
- **THEN** the command SHALL report success and register the device, and a
  subsequent `azula message send` to it SHALL connect without re-presenting
  the invite

#### Scenario: Issuer declines
- **WHEN** the user declines the request on the issuing device
- **THEN** the command SHALL exit non-zero reporting the decline, and no
  device SHALL be registered

#### Scenario: No response within the wait
- **WHEN** the issuer neither accepts nor declines within the bounded wait
- **THEN** the command SHALL exit non-zero reporting the timeout, no device
  SHALL be registered, and re-running the same invite SHALL resume the
  existing pending request rather than create a second one

#### Scenario: Caller overrides the wait
- **WHEN** a caller supplies its own bound for how long to wait
- **THEN** that bound SHALL be honoured in place of the default, and the same
  distinct outcomes SHALL still be reported

#### Scenario: Issuer unreachable
- **WHEN** the invite's endpoint cannot be dialled
- **THEN** the command SHALL exit non-zero reporting the connection failure
  rather than reporting a successful pairing

#### Scenario: Invite is never silently stored
- **WHEN** any pairing attempt ends without an acceptance
- **THEN** no registry entry SHALL exist for that device, so `azula devices`
  never lists a device that was not actually paired
