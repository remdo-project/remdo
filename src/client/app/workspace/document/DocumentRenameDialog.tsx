import { Button as FormButton, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useRef, useState } from 'react';
import type { DocumentNote } from '#note-sdk';

export function DocumentRenameDialog({
  note,
  onClose,
}: {
  note: DocumentNote;
  onClose: () => void;
}) {
  const openingName = note.getText();
  const [draft, setDraft] = useState(openingName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const selectedOnOpenRef = useRef(false);

  const submit = async () => {
    const title = draft.trim();
    if (!title) {
      setError('Enter a document name.');
      return;
    }
    // Stored names keep their edge whitespace, so compare what a resubmission
    // of the opening name would send rather than the raw stored value.
    if (title === openingName.trim()) {
      onClose();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await note.rename(title);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not rename the document.');
      setPending(false);
    }
  };

  return (
    <Modal
      centered
      // A pending submission blocks every dismissal path, including the
      // header close button.
      onClose={() => { if (!pending) onClose(); }}
      opened
      title="Rename document"
      transitionProps={{ duration: 0 }}
    >
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Stack gap="md">
          <TextInput
            data-autofocus
            disabled={pending}
            error={error}
            errorProps={{ role: 'alert' }}
            label="Document name"
            onChange={(event) => { setDraft(event.currentTarget.value); setError(null); }}
            // Only the opening focus selects, so returning to the field keeps the caret.
            onFocus={(event) => {
              if (selectedOnOpenRef.current) return;
              selectedOnOpenRef.current = true;
              event.currentTarget.select();
            }}
            value={draft}
          />
          {pending && <span role="status">Renaming…</span>}
          <Group justify="flex-end">
            <FormButton disabled={pending} onClick={onClose} variant="default">Cancel</FormButton>
            <FormButton disabled={pending} type="submit">Rename</FormButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
