# Account Sync Delta

## ADDED Requirements

### Requirement: Resuming a Device Re-Dials Its Siblings
A device that returns to the foreground SHALL re-dial its known siblings and re-sync, on every platform that exposes a foreground signal. Sibling re-dial SHALL NOT depend solely on a transport re-bind or a cold start, because an application that remains resident never re-binds and would otherwise never converge with its siblings. The re-dial SHALL fire only on the transition into the foreground, not on every foreground notification, and concurrent dials to the same sibling SHALL be suppressed.

#### Scenario: Backgrounded device converges on resume
- **WHEN** a device is backgrounded, a sibling appends new entries, and the device is then returned to the foreground
- **THEN** it re-dials its siblings and converges without requiring a force-stop or cold relaunch

#### Scenario: Repeated foreground entry does not stack dials
- **WHEN** a device enters the foreground twice in quick succession
- **THEN** at most one dial per sibling is in flight, and no duplicate concurrent session is opened to the same sibling
