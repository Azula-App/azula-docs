import { CodeBlock } from "@azula/design-system";

export function SessionLink() {
  return (
    <div style={{ maxWidth: 480 }}>
      <CodeBlock>{"connect  https://azula.app/s/<your-session-code>"}</CodeBlock>
    </div>
  );
}

export function MultiLine() {
  return (
    <div style={{ maxWidth: 480 }}>
      <CodeBlock>
        {"azula pair\nsession k7-fox-ember · relay sfo\npeer zuko joined · direct · 12ms"}
      </CodeBlock>
    </div>
  );
}
