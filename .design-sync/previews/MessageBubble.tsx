import { MessageBubble } from "@azula/design-system";

export function Conversation() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 380 }}>
      <MessageBubble from="them" time="14:30">
        got the code?
      </MessageBubble>
      <MessageBubble from="me" time="14:31">
        k7-fox-ember — paste it in azula
      </MessageBubble>
      <MessageBubble from="them" time="14:31">
        connected. 12ms, direct
      </MessageBubble>
    </div>
  );
}

export function Longer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 380 }}>
      <MessageBubble from="me" time="09:12">
        The tok relay is back up, so mai should reconnect on her own. If she
        doesn&apos;t, just run azula pair again and send her the new code.
      </MessageBubble>
    </div>
  );
}
