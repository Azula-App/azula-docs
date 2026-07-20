import { Button, Icon } from "@azula/design-system";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Button variant="primary">Connect</Button>
      <Button variant="default">Copy code</Button>
      <Button variant="ghost">App Store (soon)</Button>
      <Button variant="borderless">Regenerate ticket</Button>
    </div>
  );
}

export function WithIcon() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Button variant="primary" icon={<Icon name="bolt" size={15} />}>
        Connect
      </Button>
      <Button variant="default" icon={<Icon name="terminal" size={15} />}>
        Open shell
      </Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Button variant="primary" disabled>
        Connect
      </Button>
      <Button variant="default" disabled>
        Copy code
      </Button>
    </div>
  );
}
