import type { ReactNode } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

export function RemdoDialog({
  children,
  isDismissable = true,
  onClose,
  title,
}: {
  children: ReactNode;
  /** False while a submission is in flight, which blocks every dismissal path. */
  isDismissable?: boolean;
  onClose: () => void;
  title: string;
}) {
  return (
    <ModalOverlay
      className="remdo-modal-overlay"
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={!isDismissable}
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <Modal className="remdo-modal">
        <Dialog className="remdo-dialog">
          <div className="remdo-dialog-header">
            <Heading className="remdo-dialog-title" slot="title">{title}</Heading>
            <Button
              aria-label="Close"
              className="remdo-dialog-close"
              isDisabled={!isDismissable}
              onPress={onClose}
            >
              {'×'}
            </Button>
          </div>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
