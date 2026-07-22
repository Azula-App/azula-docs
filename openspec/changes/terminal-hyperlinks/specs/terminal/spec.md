## ADDED Requirements

### Requirement: Hyperlink Recognition

The terminal SHALL recognize hyperlinks from two sources: OSC 8 sequences
(`OSC 8 ; params ; URI ST` opening a link, `OSC 8 ; ; ST` closing it), which
associate a target with the cells written while the link is open; and bare
`http://` or `https://` runs appearing in rendered text. Only the `http` and
`https` schemes SHALL be recognized — a URI with any other scheme SHALL remain
inert text, whether it arrived via OSC 8 or as literal output. Link association
SHALL survive a line wrap, a resize reflow, and a row moving into scrollback.

#### Scenario: A program emits an OSC 8 hyperlink

- **WHEN** the program writes `OSC 8 ; ; https://example.com ST`, then the text
  `docs`, then `OSC 8 ; ; ST`
- **THEN** the four cells holding `docs` are associated with
  `https://example.com`, and the surrounding cells are not

#### Scenario: A bare URL is printed

- **WHEN** the program prints `see https://example.com/x for details` with no
  escape sequences
- **THEN** the cells spanning `https://example.com/x` are treated as a link and
  the surrounding words are not

#### Scenario: A non-HTTP scheme is not linkified

- **WHEN** the output contains `file:///etc/passwd`, or an OSC 8 sequence whose
  URI uses a scheme other than `http`/`https`
- **THEN** the terminal SHALL NOT treat it as a link, and the text renders
  normally

#### Scenario: An overlong OSC payload is discarded

- **WHEN** an OSC payload exceeds the emulator's buffer cap before its
  terminator arrives
- **THEN** the payload SHALL be discarded rather than dispatched truncated, and
  no link is created

### Requirement: Link Rendering

The terminal SHALL render recognized links distinguishably from surrounding
text, so a user can tell what is tappable before tapping it. Link styling SHALL
NOT be applied while a mouse-tracking mode is active.

#### Scenario: A link is visible as a link

- **WHEN** a row containing a recognized link is rendered and no mouse-tracking
  mode is active
- **THEN** the link's cells are visually distinguished from adjacent
  non-link text

### Requirement: Tap To Open A Link

The terminal SHALL open a recognized link when the user taps it, and SHALL show
the link's full target for confirmation before opening anything. A tap that does
not land on a link SHALL behave exactly as it does today — clearing an active
selection, or reclaiming keyboard focus.

Because terminal output originates on a remote machine and OSC 8 permits the
displayed text to differ from the target, confirmation SHALL show the actual
URI that will be opened, not the text that was clicked.

#### Scenario: Tapping a link asks before opening

- **WHEN** the user taps a cell belonging to a recognized link
- **THEN** the terminal presents the link's full target for confirmation, and
  opens it in the platform browser only after the user confirms

#### Scenario: An OSC 8 link whose text differs from its target

- **WHEN** the user taps an OSC 8 link whose displayed text is
  `https://safe.example` but whose URI is `https://other.example`
- **THEN** the confirmation shows `https://other.example` — the URI that will
  actually be opened

#### Scenario: Declining leaves nothing open

- **WHEN** the user dismisses or cancels the confirmation
- **THEN** no URL is opened and the terminal returns to its prior state

#### Scenario: A tap that misses a link is unchanged

- **WHEN** the user taps a cell that is not part of a link
- **THEN** the tap clears an active selection if there is one, and otherwise
  reclaims keyboard focus, exactly as before this requirement

### Requirement: Links Yield To Mouse Tracking

The terminal SHALL NOT intercept taps for link opening while a mouse-tracking
mode (`?1000`, `?1002`, `?1003`) is active. The remote program owns the pointer
in that state, and its mouse reports take precedence over link interaction.

#### Scenario: A TUI with mouse tracking on

- **WHEN** the remote program has enabled a mouse-tracking mode and the user
  taps a cell that would otherwise be a recognized link
- **THEN** the terminal sends the mouse report for that cell and does not open
  or offer to open the link
