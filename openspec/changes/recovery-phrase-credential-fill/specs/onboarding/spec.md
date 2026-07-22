## ADDED Requirements

### Requirement: Restore Offers A Saved Recovery Phrase

The restore step SHALL offer a recovery phrase held in the platform credential
store, where the platform provides one, so the user does not have to copy the
phrase out of their password manager by hand. On Android this SHALL query the
platform credential store; on iOS the phrase input SHALL be presented so that
the system's AutoFill can offer it. Desktop SHALL be unaffected.

A filled phrase SHALL be placed into the phrase input only. It SHALL NOT restore
the identity on its own — the user still confirms, and the existing
validate-then-commit path applies unchanged, including the inline error for an
invalid phrase.

#### Scenario: A saved phrase is offered and filled

- **WHEN** the user is on the restore step, a recovery phrase for this app is
  held in the platform credential store, and the user invokes the fill
  affordance and selects that credential
- **THEN** the phrase is placed into the recovery-phrase input, and the identity
  is not restored until the user confirms

#### Scenario: A filled phrase is still validated

- **WHEN** a phrase filled from the credential store fails validation — wrong
  word count, unknown word, or a failing checksum
- **THEN** the inline error is shown and the identity is unchanged, exactly as
  for a typed or pasted phrase

#### Scenario: No saved phrase is available

- **WHEN** no credential is available for this app, or the platform has no
  credential store
- **THEN** the restore step remains fully usable by typing or pasting, and the
  step SHALL NOT report that a phrase was filled

#### Scenario: The user dismisses the provider's picker

- **WHEN** the user invokes the fill affordance and dismisses the provider's
  sheet without choosing a credential
- **THEN** the phrase input is left unchanged

### Requirement: Saved Credentials Are Associated With The Azula Domain

Recovery-phrase credentials SHALL be associated with the `azula.app` domain
rather than with a single application package, so that a phrase saved by one
azula build is offered by another. This SHALL be published as a
`delegate_permission/common.get_login_creds` relation in the site's
`assetlinks.json`.

#### Scenario: The site publishes the login-credentials relation

- **WHEN** `/.well-known/assetlinks.json` is fetched from `azula.app`
- **THEN** it includes a `delegate_permission/common.get_login_creds` relation
  for the azula Android package alongside the existing URL-handling relation
