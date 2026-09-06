## ADDED Requirements

### Requirement: Supported OpenClaw Release

The plugin SHALL state a minimum supported OpenClaw release and SHALL be built
and tested against it. Releases below that minimum SHALL NOT be supported, and
the plugin SHALL NOT carry compatibility shims for them.

The minimum SHALL be raised only in a release of the plugin that says so, so an
operator can tell from the plugin's own version whether their gateway is new
enough.

#### Scenario: Gateway below the minimum

- **WHEN** the plugin is installed into an OpenClaw older than its stated
  minimum
- **THEN** that combination is unsupported, and the plugin's documentation
  directs the operator to upgrade OpenClaw rather than to an older plugin

#### Scenario: Minimum is discoverable without installing

- **WHEN** an operator wants to know which OpenClaw releases a given plugin
  version supports
- **THEN** the plugin's own documentation states it

### Requirement: Declared Surfaces Match What the Plugin Registers

The plugin's manifest SHALL declare exactly the surfaces it registers — no
more and no fewer. OpenClaw derives the capability-consent summary an operator
is shown from these declarations, so a declaration that overstates asks for
consent the plugin does not need, and one that understates hides what it does.

This plugin registers one chat channel and nothing else: no providers, tools,
hooks, MCP servers, CLI commands or backends, no skills, and no dangerous
config flags.

#### Scenario: Consent summary reflects the channel and nothing more

- **WHEN** an operator installs the plugin and is shown the capability-consent
  summary
- **THEN** it names the channel the plugin registers, and does not list
  surfaces the plugin never uses

#### Scenario: A newly registered surface is declared before it ships

- **WHEN** the plugin starts registering a surface it did not before
- **THEN** the manifest declares it in the same release, rather than the
  gateway granting consent for something the operator was never shown

### Requirement: Documented Install Flow Works Unattended

The plugin's documented install command SHALL be one that actually completes on
the minimum supported release, including any consent or trust gates that
release imposes. A command that aborts at a prompt SHALL NOT be presented as
the install instruction.

Where a gate exists, the documentation SHALL say what it is asking, not merely
which flag silences it — an operator consenting to a plugin's capabilities
should be told what they cover.

#### Scenario: Install command completes as written

- **WHEN** an operator runs the install command exactly as documented on the
  minimum supported release
- **THEN** the plugin installs, rather than aborting on a trust or consent gate
  the documentation did not mention

#### Scenario: Consent is explained, not just bypassed

- **WHEN** the documentation tells an operator to pass a capability-consent
  flag
- **THEN** it also states what that consent covers for this plugin
