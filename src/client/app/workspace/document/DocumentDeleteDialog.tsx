import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import type { DocumentNote } from '#note-sdk';
import { RemdoDialog } from '#client/ui/RemdoDialog';

export function DocumentDeleteDialog({
  note,
  onClose,
}: {
  note: DocumentNote;
  onClose: () => void;
}) {
  // Read once: the live note throws once its document leaves the list.
  const [name] = useState(() => note.getText());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await note.delete();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete the document.');
      setPending(false);
    }
  };

  return (
    <RemdoDialog isDismissable={!pending} onClose={onClose} title={`Delete “${name}”?`}>
      <Stack gap="md">
        <Text size="sm">
          The document and its content are deleted for everyone it is shared with. This cannot be undone.
        </Text>
        {error && <Alert color="red" role="alert" variant="light">{error}</Alert>}
        {pending && <span role="status">Deleting…</span>}
        <Group justify="flex-end">
          <Button disabled={pending} onClick={onClose} variant="default">Cancel</Button>
          <Button color="red" disabled={pending} onClick={() => { void confirm(); }}>Delete</Button>
        </Group>
      </Stack>
    </RemdoDialog>
  );
}
