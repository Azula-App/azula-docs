import { Button, Modal } from "@azula/design-system";

export function ConfirmDisconnect() {
  return (
    <>
      {/* In-flow spacer: the overlay is position:fixed, so without this the
          document is only a few px tall and the capture crops the card. */}
      <div style={{ height: 448 }} />
      <Modal
      open={true}
      title="Disconnect zuko?"
      actions={
        <>
          <Button variant="default">Stay</Button>
          <Button variant="primary">Disconnect</Button>
        </>
      }
    >
      <p style={{ margin: 0, color: "var(--content-muted)", lineHeight: 1.5 }}>
        This tears down the direct path. Reconnecting starts over the sfo relay
        before upgrading back to direct.
      </p>
      </Modal>
    </>
  );
}
