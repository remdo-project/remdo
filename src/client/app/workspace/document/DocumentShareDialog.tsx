import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { NoteUnavailableError } from '#note-sdk';
import type { DocumentNote } from '#note-sdk';
import { useDocumentObservation } from '#client/app/user-data/user-data';
import { RemdoDialog } from '#client/ui/RemdoDialog';

type ShareState =
  | { status: 'idle' | 'pending' }
  | { status: 'error'; message: string };

function readSharing(note: DocumentNote) {
  try {
    return { name: note.getText(), recipients: note.getAccess().getChildren() };
  } catch (error) {
    if (!(error instanceof NoteUnavailableError)) throw error;
    return null;
  }
}

export function DocumentShareDialog({ note, onClose }: { note: DocumentNote; onClose: () => void }) {
  useDocumentObservation(note);
  const sharing = readSharing(note);
  const [openingName] = useState(() => note.getText());
  const [email, setEmail] = useState('');
  const [state, setState] = useState<ShareState>({ status: 'idle' });
  const pending = state.status === 'pending';

  const submit = async () => {
    const recipient = email.trim();
    if (!recipient) {
      return;
    }
    setState({ status: 'pending' });
    try {
      await note.shareWith(recipient);
      setEmail('');
      setState({ status: 'idle' });
    } catch (failure) {
      setState({
        message: failure instanceof Error ? failure.message : 'Could not share the document.',
        status: 'error',
      });
    }
  };

  const recipients = sharing?.recipients ?? [];

  return (
    <RemdoDialog onClose={onClose} title={`Share “${sharing?.name ?? openingName}”`} wide>
      <Stack gap="lg">
        <Stack component="section" gap="sm">
          <Text component="h3" fw={600} size="sm">People with access</Text>
          {!sharing && <Text c="dimmed" size="sm">This document is no longer available.</Text>}
          {sharing && recipients.length === 0 && <Text c="dimmed" size="sm">Only you have access.</Text>}
          {recipients.map((recipient) => (
                <Stack gap={0} key={recipient.getId()}>
                  <Text size="sm">{recipient.getText()}</Text>
                  {recipient.getName() && <Text c="dimmed" size="xs">{recipient.getEmail()}</Text>}
                </Stack>
              ))}

          {state.status === 'error' && (
            <Alert color="red" title="Could not share document">{state.message}</Alert>
          )}

          <form aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <Group align="flex-end" gap="sm" wrap="nowrap">
              <TextInput
                autoFocus
                disabled={pending}
                label="Invite by email"
                onChange={(event) => { setEmail(event.currentTarget.value); setState({ status: 'idle' }); }}
                required
                style={{ flex: 1 }}
                type="email"
                value={email}
              />
              <Button loading={pending} type="submit">Invite</Button>
            </Group>
          </form>
        </Stack>

        <Stack component="section" gap="sm">
          <Text component="h3" fw={600} size="sm">General access</Text>
          <TextInput
            disabled
            label="Anyone with the link"
            readOnly
            value="Only people invited"
          />
          <Text c="dimmed" size="sm">Link sharing is not available yet.</Text>
        </Stack>

        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">Done</Button>
        </Group>
      </Stack>
    </RemdoDialog>
  );
}
