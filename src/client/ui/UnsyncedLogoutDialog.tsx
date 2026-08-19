import { Button, Group, Modal, Stack, Text } from '@mantine/core';

interface UnsyncedLogoutDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  opened: boolean;
}

export default function UnsyncedLogoutDialog({
  onCancel,
  onConfirm,
  opened,
}: UnsyncedLogoutDialogProps) {
  return (
    <Modal
      centered
      onClose={onCancel}
      opened={opened}
      title="Sign out and discard unsaved changes?"
      // The dialog appears only to confirm irreversible loss, so it opens at
      // once rather than fading in ahead of the choice.
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="md">
        <Text size="sm">
          {`Some changes have not reached the server. Signing out erases this device's local copy, and they cannot be recovered.`}
        </Text>
        <Group justify="flex-end">
          <Button onClick={onCancel} variant="default">
            Cancel
          </Button>
          <Button color="red" onClick={onConfirm}>
            Sign out and discard
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
