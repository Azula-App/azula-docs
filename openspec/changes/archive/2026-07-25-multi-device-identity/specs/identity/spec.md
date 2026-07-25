# Identity Delta

## ADDED Requirements

### Requirement: Identity Is a Root Keypair Above Device Node Keys
An azula identity SHALL be a root Ed25519 keypair whose 32-byte secret is the identity's single recoverable secret; each device SHALL additionally hold its own iroh node keypair used for transport. Peers SHALL identify a contact by the root public key. A device SHALL present its membership in an identity via a device certificate signed by the root key (see `device-linking`). On first launch after upgrade, an existing single-device identity's node secret SHALL become the root secret unchanged, and that device SHALL continue using the same key as its device key (a self-certificate with `device_pk == root_pk`), so its recovery phrase, node id, and existing contacts all remain valid.

#### Scenario: Upgrade preserves phrase and node id
- **WHEN** a device with a pre-multi-device identity first launches the upgraded app
- **THEN** the existing secret becomes the root secret, the recovery phrase and node id are unchanged, and a self-certificate with `device_pk == root_pk` is issued

#### Scenario: A second device has a distinct node id
- **WHEN** a second device is enrolled onto an identity
- **THEN** it holds its own node keypair with a different node id, and peers associate both devices with the same root public key

### Requirement: Key Roles and Signing Boundaries
Key material SHALL sign data outside transport TLS in exactly three places: a device node key SHALL sign issued invitations (verified against the node id in the invite's ticket, unchanged); the root key SHALL sign device certificates; and the root key SHALL sign revocation statements. No other payloads SHALL be signed by identity or device key material.

#### Scenario: Invite signed by a device key still verifies
- **WHEN** any enrolled device of an identity mints a signed invite
- **THEN** the signature verifies against that device's node id embedded in the invite's ticket, exactly as for a single-device identity

#### Scenario: Certificate not signed by the root is invalid
- **WHEN** a device certificate's signature does not verify against the certificate's embedded root public key
- **THEN** the certificate is treated as invalid and grants no identity association

### Requirement: Restore Recovers the Identity Onto This Device
Submitting a valid 24-word recovery phrase SHALL enroll the current device into the identity rather than replacing any key in place: the device SHALL retain (or mint, on a fresh install) its own node keypair, store the decoded root secret, self-issue a device certificate, append a `device_add` log entry, and begin syncing (see `account-sync`). An invalid phrase SHALL leave existing state unchanged and show an inline error. If the device previously held a different identity, that identity's root secret SHALL be overwritten only after the new phrase validates. A failed transport re-bind SHALL NOT fail the restore — the enrollment is committed locally and the transport degrades to offline exactly as a failed initial bind does.

#### Scenario: Restore on a second device adds a device
- **WHEN** a valid phrase for an existing identity is submitted on a fresh device
- **THEN** the device joins the identity as a new device with its own node id, and the identity's other devices continue operating undisturbed

#### Scenario: Invalid restore attempt
- **WHEN** an invalid phrase is submitted to restore
- **THEN** the existing state is left unchanged and an inline error is shown

#### Scenario: History arrives after restore
- **WHEN** a restored device completes enrollment and reaches any sibling device (including the mailbox)
- **THEN** message history, contacts, and read state converge via log sync rather than being decoded from the phrase

## MODIFIED Requirements

### Requirement: 24-Word BIP-39 Recovery Phrase Encoding
The 32-byte root secret key SHALL be encoded as a standard BIP-39 24-word English mnemonic: an 8-bit checksum (the first byte of SHA-256 of the key) SHALL be appended to the 256 key bits, and the resulting 264 bits SHALL be chunked into 24 eleven-bit indices into the 2048-word BIP-39 wordlist. Device node keys SHALL NOT have mnemonic encodings — the phrase encodes only the root secret.

#### Scenario: All-zero key vector
- **WHEN** encoding a key of all-zero entropy
- **THEN** the result is the word "abandon" repeated 23 times followed by
  "art"

#### Scenario: All-0xff key vector
- **WHEN** encoding a key of all-`0xff` bytes
- **THEN** the result is the word "zoo" repeated 23 times followed by "vote"

#### Scenario: Device keys have no phrase
- **WHEN** a QR-linked device (holding no root secret) opens the reveal-recovery-phrase flow
- **THEN** the app explains that the phrase lives with root-holding devices instead of showing a phrase for the device key

### Requirement: Per-Platform Key-at-Rest Storage
Each platform SHALL persist the device node key, and the root secret when this device holds one, through the shared transport export/import seam, using its existing storage mechanism: JVM desktop in the macOS login Keychain (plain file off-mac); Android inside an encrypted preferences store (Keystore-backed AES), self-healing a corrupt keyset by recreating the store rather than falling back to a demo identity; iOS in the platform keychain-backed store. The root secret and node key SHALL be stored under distinct entries. `-mock` apps SHALL persist no key — every launch SHALL generate a throwaway identity.

#### Scenario: Android corrupt keyset self-heal
- **WHEN** Android detects a corrupt encrypted keyset on read
- **THEN** it deletes and recreates the preferences store rather than
  dropping into demo mode

#### Scenario: Mock app throwaway identity
- **WHEN** a `-mock` app launches
- **THEN** it generates a fresh identity and persists nothing to disk

#### Scenario: QR-linked device stores no root secret
- **WHEN** a device was enrolled via QR-link
- **THEN** its key store contains its node key and certificate but no root secret entry

### Requirement: Recovery Phrase Security Properties
The recovery phrase SHALL be sufficient on its own for full control of the identity, with no additional PIN or passphrase layer — anyone holding the 24 words SHALL be able to enroll a device with root authority, including issuing and revoking device certificates. The phrase itself SHALL NOT encode message history, contacts, or peer tickets; history reaches a restored device only by syncing from the identity's reachable devices. The 8-bit checksum SHALL be treated as a transcription-error check, not a tampering or security boundary.

#### Scenario: Phrase alone grants impersonation
- **WHEN** a third party obtains the 24-word phrase
- **THEN** they can enroll a device with full root authority — send, receive, enroll, and revoke — with no further secret required

#### Scenario: Phrase without reachable devices yields no history
- **WHEN** a phrase is restored while no sibling device (including any mailbox) is reachable
- **THEN** the identity is recovered but history is empty until a sibling comes online, since the phrase encodes only the root secret

## REMOVED Requirements

### Requirement: Identity Is an iroh Node Keypair
**Reason**: Identity is redefined as a root keypair above per-device node keys; the 1:1 identity-to-node-key equivalence no longer holds.
**Migration**: See `Identity Is a Root Keypair Above Device Node Keys` — existing identities upgrade in place with the old node secret becoming the root secret.

### Requirement: Identity Key Also Signs Invitations
**Reason**: Signing boundaries now span two key kinds (device keys sign invites; the root key signs certificates and revocations), replaced by `Key Roles and Signing Boundaries`.
**Migration**: Invite signing/verification mechanics are unchanged — only the key's name changed (the signing key is the device node key).

### Requirement: Restore Flow Replaces the Identity In Place
**Reason**: Restore no longer replaces a device's key; it enrolls the device into the recovered identity. This also resolves the open decisions in the in-flight `recovery-restore-ux` change.
**Migration**: See `Restore Recovers the Identity Onto This Device`.
