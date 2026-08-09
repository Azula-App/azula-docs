# site Specification

## Purpose
Defines what azula.app itself serves: the public routes and their contracts,
the documentation the site owes someone who wants to use azula, the
machine-readable surface (`.md` twin per page, `/llms.txt`, `/llms-full.txt`)
that lets an agent read the site without parsing HTML, and the "loads nothing
but itself" invariant the privacy policy depends on.

The deeplink *association* contract — the well-known files and how a link
opens the app — lives in [`deeplinks`](../deeplinks/spec.md); this capability
covers the site serving them. Implementation lives in `azula-site` (Astro on
Cloudflare Workers); see that repo's `URLS.md` for the route map and build
model.
## Requirements
### Requirement: The site serves its documented routes

azula.app SHALL serve a landing page, a privacy policy, a documentation
section, the deeplink landing pages, a `/mcp` informational endpoint, and a
health check. Routes that do not depend on the request SHALL be prerendered and
served as static assets; only routes carrying a payload or a method-dependent
response SHALL be rendered per request.

#### Scenario: Fetching a documented page

- **WHEN** a client requests `/`, `/privacy`, `/docs`, or any `/docs/<page>`
- **THEN** the site SHALL respond `200` with `text/html; charset=utf-8`

#### Scenario: An unknown path

- **WHEN** a client requests a path that matches no route
- **THEN** the site SHALL respond `404` with the not-found page

#### Scenario: A deeplink payload that does not decode

- **WHEN** a client requests `/i/<payload>`, `/l/<payload>`, or `/s/<token>`
  with a payload that fails structural validation
- **THEN** the site SHALL respond `404` and render the invalid-link page, which
  offers the store links and an explanation rather than the payload

#### Scenario: An MCP client POSTs to /mcp

- **WHEN** a client sends `POST /mcp`
- **THEN** the site SHALL respond `501` with a JSON-RPC error object directing
  the caller to `azula mcp` on their own machine, and SHALL NOT reject the
  request as a cross-origin form submission

### Requirement: Every page has a Markdown twin

Every page whose content is prose SHALL be available as Markdown at the same
path plus `.md` (the site root as `/index.md`), served as `text/markdown`. The
Markdown served SHALL be the source the HTML page renders, not a conversion of
the rendered HTML, so the two cannot diverge. The 404 page is exempt.

#### Scenario: Fetching a page as Markdown

- **WHEN** a client requests `/docs/cli.md`
- **THEN** the site SHALL respond `200` with `text/markdown; charset=utf-8`,
  beginning with the page's title as an H1 and its one-line description as a
  blockquote

#### Scenario: Discovering the Markdown form from the HTML page

- **WHEN** a client fetches a page's HTML
- **THEN** the `<head>` SHALL contain
  `<link rel="alternate" type="text/markdown">` pointing at that page's `.md`,
  and the rendered page SHALL offer a visible control linking to it

#### Scenario: A page is added

- **WHEN** a new page is added to the site's content
- **THEN** its Markdown twin SHALL be generated without a separate authoring
  step, and a build that produces a page with no twin SHALL fail

### Requirement: The site publishes an llms.txt index

The site SHALL serve `/llms.txt` following the llms.txt convention — an H1
name, a blockquote summary, then sections of links each carrying a one-line
note — where every page link points at that page's Markdown twin. It SHALL also
serve `/llms-full.txt`, the concatenation of every page's Markdown. Both SHALL
be generated from the site's content, not maintained by hand.

#### Scenario: An agent discovers what the site contains

- **WHEN** a client requests `/llms.txt`
- **THEN** the site SHALL respond `200` with `text/plain`, listing every
  documentation page, the privacy policy, and the project's source
  repositories, each as a link with a one-line description

#### Scenario: A page is missing from the index

- **WHEN** the built site contains a Markdown twin that `/llms.txt` does not
  list
- **THEN** the build check SHALL fail

### Requirement: The site documents the CLI and links to its source

The documentation section SHALL cover installing the CLI, its command surface,
connecting an LLM over MCP, and the URL scheme, and SHALL link to every public
azula repository. Installation instructions for package channels that are not
yet published SHALL say so and SHALL give a route that works today.

#### Scenario: A reader wants to install the CLI

- **WHEN** a reader opens the installation page before the first tagged release
- **THEN** the page SHALL present the Homebrew, cargo and npx channels, SHALL
  state that they go live with the first release, and SHALL give
  build-from-source instructions that work now

#### Scenario: A reader looks for the source

- **WHEN** a reader opens the documentation
- **THEN** the site SHALL link to the `azula-cli`, `azula-app`, `iroh-kmp`,
  `azula-site` and `azula-docs` repositories, each with a one-line description
  of what it contains

### Requirement: A page loads nothing but itself

No page SHALL load a script, stylesheet, font, image, or any other resource
from a third-party origin — the claim `/privacy` makes about this site. Every
page SHALL carry a Content-Security-Policy restricting `default-src` to
`'self'`, and the policy SHALL NOT permit `unsafe-inline` for scripts. This
SHALL be verified against the build output, not only asserted in prose.

#### Scenario: A third-party resource is introduced

- **WHEN** a built page references a `<script>`, `<link>`, `<img>` or other
  resource on an off-origin host
- **THEN** the build check SHALL fail, and a browser SHALL refuse the request
  under the page's Content-Security-Policy

#### Scenario: A page needs scripting

- **WHEN** a page requires JavaScript — the deeplink pages' custom-scheme
  redirect and expiry countdown, or the copy-as-Markdown control
- **THEN** that script SHALL be served from this origin or carried as a hashed
  inline script, and the page SHALL remain usable without it

### Requirement: Worker-rendered responses carry the site's security headers

Responses rendered by the Worker SHALL carry the same security headers as the
static assets — `X-Content-Type-Options: nosniff`, a referrer policy, and
frame denial — since asset header rules do not apply to them. HTML responses
SHALL declare `charset=utf-8`.

#### Scenario: Fetching a deeplink landing page

- **WHEN** a client requests `/i/<payload>` with a valid payload
- **THEN** the response SHALL include `X-Content-Type-Options: nosniff`, a
  `Referrer-Policy`, `X-Frame-Options: DENY`, and
  `content-type: text/html; charset=utf-8`

### Requirement: Published shell examples are executable or explicitly illustrative

Every fenced shell block the site publishes SHALL either be executable —
byte-identical to the region of a script that runs against a real `azula`
binary and asserts the claim its page makes — or be recorded in an allowlist
with a stated reason it cannot run. A block that is neither SHALL fail the
documentation check, so an unverified snippet cannot be added silently.

The allowlist SHALL key each entry by the block's content hash rather than its
location, so that moving a block is inert but editing one invalidates its entry
and forces the reason to be re-examined.

#### Scenario: A block is executable

- **WHEN** a fenced `sh` block is tagged as an example
- **THEN** its text SHALL be byte-identical to the region the corresponding
  script executes, and the check SHALL fail if the two diverge by so much as a
  character

#### Scenario: A block cannot be executed

- **WHEN** a snippet demonstrates something unrunnable unattended, such as a
  command that binds an iroh endpoint or installs software
- **THEN** it SHALL carry an allowlist entry naming the page and the reason,
  and SHALL still be covered by the lint and CLI-surface checks

#### Scenario: A new untagged block is added

- **WHEN** a contributor adds a fenced `sh` block that is neither tagged nor
  allowlisted
- **THEN** the check SHALL fail and report the content hash needed to record it

#### Scenario: An allowlisted block is edited

- **WHEN** the text of an allowlisted block changes
- **THEN** its entry SHALL no longer match and the check SHALL fail, so the
  stated reason is reconsidered rather than inherited

### Requirement: Documented invocations match the CLI's own surface

Every `azula` invocation the site publishes SHALL name a subcommand, flag and
flag value that the binary reports in its own help output. This SHALL cover
invocations wherever they appear — inside a fenced block, in an inline code
span, or in the command-reference table, whose bracketed-optional and
alternation notation SHALL be interpreted rather than skipped.

#### Scenario: A documented flag is renamed in the CLI

- **WHEN** the CLI renames or removes a flag, subcommand, or flag value that
  the site documents
- **THEN** the check SHALL fail, naming the page, the line, and what the binary
  actually accepts

#### Scenario: A command is documented only in the reference table

- **WHEN** an invocation appears solely as a table row such as
  `azula terminal [new|list|attach|kill]`
- **THEN** each alternative SHALL be validated as a real subcommand, and each
  bracketed flag as a real flag

### Requirement: Examples run offline and leave no trace

An executable example SHALL invoke only commands that bind no iroh endpoint,
because the CLI's networked paths await a relay connection with no timeout and
would hang rather than fail. Each example SHALL confine all state to a
temporary workspace, leaving the reader's own identity, device registry and
sessions untouched.

#### Scenario: An example would need the network

- **WHEN** a proposed example invokes a command that binds an endpoint, such as
  `azula mcp` or `azula message send`
- **THEN** it SHALL NOT be made executable, and the block SHALL be allowlisted
  instead

#### Scenario: An example runs on a machine with real azula state

- **WHEN** the example suite runs on a machine with an existing `~/.azula`
- **THEN** that directory SHALL be byte-identical afterwards, and no temporary
  workspace SHALL remain

#### Scenario: An example needs a project-scoped registry

- **WHEN** an example demonstrates the project-versus-global registry
  precedence
- **THEN** it SHALL achieve isolation through `HOME` and the working directory
  rather than the registry path override, which collapses the two registries
  and would bypass the very behaviour being demonstrated

