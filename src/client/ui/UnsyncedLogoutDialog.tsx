import { Button, Group, Stack, Text } from '@mantine/core';
import { RemdoDialog } from './RemdoDialog';

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
  if (!opened) return null;
  return (
    <RemdoDialog onClose={onCancel} title="Sign out and discard unsaved changes?">
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
    </RemdoDialog>
  );
}
