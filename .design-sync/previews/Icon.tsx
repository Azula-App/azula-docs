import { Icon } from "@azula/design-system";
import type { IconName } from "@azula/design-system";

const names: IconName[] = ["bolt", "terminal", "lock", "link", "chat", "controls"];

export function Vocabulary() {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {names.map((name) => (
        <span
          key={name}
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            color: "var(--primary-light)",
          }}
        >
          <Icon name={name} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: "var(--content-muted)",
            }}
          >
            {name}
          </span>
        </span>
      ))}
    </div>
  );
}

export function InheritsColor() {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      <span style={{ color: "var(--success)" }}>
        <Icon name="bolt" />
      </span>
      <span style={{ color: "var(--content-muted)" }}>
        <Icon name="bolt" />
      </span>
      <span style={{ color: "var(--primary)" }}>
        <Icon name="bolt" />
      </span>
    </div>
  );
}
