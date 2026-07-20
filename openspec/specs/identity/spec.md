# Identity Specification

## Purpose
Defines what an azula identity is (an iroh node keypair), how it is encoded
as a 24-word BIP-39 recovery phrase, where the key is stored per platform,
and the export/restore flows and security constraints around it.

## Requirements

### Requirement: Identity Is an iroh Node Keypair
An azula identity SHALL be exactly a 32-byte iroh secret key; the node id
SHALL be its hex-encoded public key. There SHALL be no account or
server-side identity — losing the key SHALL produce an unrelated new node
id, not a recoverable one.

#### Scenario: Key loss changes identity
- **WHEN** a device's persisted secret key is lost (e.g. app data cleared)
  and no key is restored
- **THEN** a new keypair is generated on next launch, yielding a different
  node id and a different connect ticket/QR than before

### Requirement: Identity Key Also Signs Invitations
The same node secret key SHALL be usable to sign issued invitations with an
Ed25519 signature, verifiable against the node id embedded in that invite's
ticket. This SHALL be the only place identity key material signs data rather
than securing transport TLS.

#### Scenario: Verifying a signed invite
- **WHEN** a signed invite ticket is checked
- **THEN** its signature is verified against the node id embedded in that
  same ticket

### Requirement: Personas Are Excluded From Identity
Personas (name/avatar/description) SHALL be a separate per-conversation
cosmetic layer, SHALL NOT be considered part of the identity, and SHALL NOT
be encoded in or restored by the recovery phrase.

#### Scenario: Restoring identity leaves personas untouched
- **WHEN** a recovery phrase is restored
- **THEN** persona name/avatar/description are unaffected, since they are
  not part of the phrase

### Requirement: 24-Word BIP-39 Recovery Phrase Encoding
The 32-byte secret key SHALL be encoded as a standard BIP-39 24-word English
mnemonic: an 8-bit checksum (the first byte of SHA-256 of the key) SHALL be
appended to the 256 key bits, and the resulting 264 bits SHALL be chunked
into 24 eleven-bit indices into the 2048-word BIP-39 wordlist.

#### Scenario: All-zero key vector
- **WHEN** encoding a key of all-zero entropy
- **THEN** the result is the word "abandon" repeated 23 times followed by
  "art"

#### Scenario: All-0xff key vector
- **WHEN** encoding a key of all-`0xff` bytes
- **THEN** the result is the word "zoo" repeated 23 times followed by "vote"

### Requirement: Recovery Phrase Decode Validation
Decoding SHALL succeed only when the input has exactly 24 words that are all
present in the wordlist and the trailing 8 bits match the SHA-256 checksum of
the recovered key; otherwise decode SHALL return null rather than producing a
key. Whitespace and case SHALL be normalized before validation.

#### Scenario: Invalid phrase rejected
- **WHEN** a phrase has the wrong word count, contains an unknown word, or
  fails the checksum
- **THEN** decode returns null and no key is derived or imported

#### Scenario: Messy paste still validates
- **WHEN** a pasted phrase has inconsistent case or extra whitespace but is
  otherwise a valid phrase
- **THEN** it is normalized before validation and decodes successfully

### Requirement: Per-Platform Key-at-Rest Storage
Each platform SHALL persist the raw 32-byte secret key through the shared
transport export/import seam, using its own storage mechanism: JVM desktop
as a plain file; Android inside an encrypted preferences store (Keystore-backed
AES), self-healing a corrupt keyset by recreating the store rather than
falling back to a demo identity; iOS as a hex string in platform user
defaults. `-mock` apps SHALL persist no key — every launch SHALL generate a
throwaway identity.

#### Scenario: Android corrupt keyset self-heal
- **WHEN** Android detects a corrupt encrypted keyset on read
- **THEN** it deletes and recreates the preferences store rather than
  dropping into demo mode

#### Scenario: Mock app throwaway identity
- **WHEN** a `-mock` app launches
- **THEN** it generates a fresh identity and persists nothing to disk

### Requirement: Export Flow Requires Explicit Reveal
Revealing the recovery phrase SHALL require a two-step dialog that never
displays the phrase on first paint: a warning-only first step, then the 24
words only after explicit confirmation. If the transport has not yet bound,
export SHALL fail with a message telling the user to connect first, rather
than showing a partial or fabricated phrase.

#### Scenario: Reveal attempted before transport binds
- **WHEN** the user opens the reveal-recovery-phrase flow before the
  transport has ever bound
- **THEN** the app shows a "not ready yet" message instead of a phrase, and
  no phrase is generated

#### Scenario: Two-step reveal
- **WHEN** the user opens the reveal-recovery-phrase flow with a bound
  transport
- **THEN** the app first shows a warning-only step, and shows the 24 words
  only after the user explicitly proceeds

### Requirement: Restore Flow Replaces the Identity In Place
A valid pasted recovery phrase SHALL commit immediately on restore with no
second confirmation step, persisting the new key and rebinding the transport
in place without an app restart. An invalid phrase SHALL leave the existing
identity unchanged and show an inline error. The previous key SHALL be
overwritten, not archived.

#### Scenario: Valid restore
- **WHEN** a valid 24-word phrase is submitted to restore
- **THEN** the key is persisted, the transport tears down and rebinds in
  place, and the node id/connect ticket reflect the new identity without
  restarting the app

#### Scenario: Invalid restore attempt
- **WHEN** an invalid phrase is submitted to restore
- **THEN** the existing identity is left unchanged and an inline error is
  shown

#### Scenario: Old key unrecoverable after restore
- **WHEN** a restore succeeds
- **THEN** the previous key is overwritten and is not recoverable unless it
  was separately backed up beforehand

### Requirement: Recovery Phrase Security Properties
The recovery phrase SHALL be sufficient on its own for full control of the
identity, with no additional PIN or passphrase layer — anyone holding the 24
words SHALL be able to import them and impersonate the device. The phrase
SHALL NOT expose message history or saved peer tickets. The 8-bit checksum
SHALL be treated as a transcription-error check, not a tampering or security
boundary.

#### Scenario: Phrase alone grants impersonation
- **WHEN** a third party obtains the 24-word phrase
- **THEN** they can import it as their own identity and dial or receive as
  that device, with no further secret required

#### Scenario: Phrase does not leak chat history
- **WHEN** a recovery phrase is exported or restored
- **THEN** message history and saved peer tickets are unaffected, since they
  live in storage keyed independently of the transport identity

### Requirement: CLI Long-Lived Identities
Each of azula-cli's long-lived commands SHALL persist its own raw 32-byte key
under its own name, independent of the other commands' identities, with no
mnemonic encode/decode support. If the home directory is unset or
unwritable, the command SHALL fall back to an ephemeral in-memory key (with a
logged warning) rather than failing to start.

#### Scenario: Separate identities per command
- **WHEN** two different long-lived commands (e.g. the canned demo server and
  the MCP bridge) have both run on the same machine
- **THEN** they hold different node ids, each persisted under its own key
  file

#### Scenario: Unwritable home directory fallback
- **WHEN** the home directory is unset or unwritable at startup
- **THEN** the command generates an ephemeral in-memory key and logs a
  warning, so the connect code changes every run
