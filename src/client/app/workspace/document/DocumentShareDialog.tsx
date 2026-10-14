import { Avatar, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconLink, IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { createDocumentPath } from '#document-routes';
import { NoteUnavailableError } from '#note-sdk';
import type { DocumentNote } from '#note-sdk';
import { useDocumentObservation } from '#client/app/user-data/user-data';
import { Icon } from '#client/ui/Icon';
import { RemdoDialog } from '#client/ui/RemdoDialog';

type ShareState =
  | { status: 'idle' | 'pending' }
  | { status: 'error' | 'success'; message: string };
type CopyState = 'idle' | 'pending' | 'copied' | 'manual';

function readSharing(note: DocumentNote) {
  try {
    return { name: note.getText(), owner: note.canShareWith(), recipients: note.getAccess().getChildren() };
  } catch (error) {
    if (!(error instanceof NoteUnavailableError)) throw error;
    return null;
  }
}

export function DocumentShareDialog({ note, onClose }: { note: DocumentNote; onClose: () => void }) {
  useDocumentObservation(note);
  const sharing = readSharing(note);
  const [openingName] = useState(() => note.getText());
  const [openingOwner] = useState(() => note.canShareWith());
  const [email, setEmail] = useState('');
  const [state, setState] = useState<ShareState>({ status: 'idle' });
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const pending = state.status === 'pending';
  const owner = sharing?.owner ?? openingOwner;
  const recipients = sharing?.recipients ?? [];
  const link = new URL(createDocumentPath(note.getId()), window.location.origin).href;

  const submit = async () => {
    const recipient = email.trim();
    if (!recipient) return;
    const alreadyShared = recipients.some((access) => access.getEmail().toLowerCase() === recipient.toLowerCase());
    setState({ status: 'pending' });
    try {
      const access = await note.shareWith(recipient);
      setEmail('');
      setState({
        status: 'success',
        message: alreadyShared
          ? `${access.getEmail()} already has access.`
          : `Added ${access.getEmail()}. They can edit this document. No email was sent.`,
      });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Could not add access.';
      setState({ status: 'error', message: `${recipient}: ${message}` });
    }
  };

  const copyLink = async () => {
    setCopyState('pending');
    try {
      const clipboard = (navigator as { clipboard?: Clipboard }).clipboard;
      if (!clipboard) {
        setCopyState('manual');
        return;
      }
      await clipboard.writeText(link);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  };

  return (
    <RemdoDialog onClose={onClose} title={`Share “${sharing?.name ?? openingName}”`}>
      <Stack gap="lg">
        <Stack gap="xs">
          <Text component="h3" fw={500}>{owner ? 'People with access' : 'Your access'}</Text>
          {!sharing && <Text c="dimmed" size="sm">This document is no longer available.</Text>}
          {sharing && owner && (
            <>
              <Group wrap="nowrap">
                <Avatar color="violet" size="sm">Y</Avatar>
                <Text style={{ flex: 1 }}>You</Text>
                <Text c="dimmed" size="xs">Owner</Text>
              </Group>
              {recipients.length === 0 && <Text c="dimmed" size="sm">Only you have access.</Text>}
              {recipients.map((recipient) => (
                <Group key={recipient.getId()} wrap="nowrap">
                  <Avatar size="sm">{recipient.getText().slice(0, 1).toUpperCase()}</Avatar>
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text>{recipient.getText()}</Text>
                    {recipient.getName() && <Text c="dimmed" size="sm">{recipient.getEmail()}</Text>}
                  </Stack>
                  <Text c="dimmed" size="xs">Can edit</Text>
                </Group>
              ))}
            </>
          )}
          {sharing && !owner && <Text c="dimmed" size="sm">You can edit and rename this document. Only its owner can add people.</Text>}
        </Stack>

        {owner && (
          <form aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <Stack gap="xs">
              <TextInput
                autoFocus
                description="Needs an account on this RemDo server. Can edit and rename; cannot invite others. No email is sent."
                disabled={pending}
                error={state.status === 'error' ? <span role="alert">{state.message}</span> : undefined}
                label="Add a person by email"
                onChange={(event) => { setEmail(event.currentTarget.value); setState({ status: 'idle' }); }}
                required
                type="email"
                value={email}
              />
              <Button loading={pending} style={{ alignSelf: 'flex-start' }} type="submit">Add access</Button>
              {state.status === 'success' && <Text c="green" role="status" size="sm">{state.message}</Text>}
            </Stack>
          </form>
        )}

        <Stack className="document-share-link" gap="xs">
          <Group gap="xs">
            <Icon icon={IconLock} size={16} />
            <Text fw={500} size="sm">Only people with access</Text>
          </Group>
          <Text c="dimmed" size="sm">Copying this link does not change access. {owner ? 'Add someone above before sending it.' : 'People you send it to still need access.'}</Text>
          <Group justify="space-between" wrap="nowrap">
            <Text className="document-share-url" component="code" size="xs">{link}</Text>
            <Button
              leftSection={<Icon icon={copyState === 'copied' ? IconCheck : IconLink} size={16} />}
              loading={copyState === 'pending'}
              onClick={() => { void copyLink(); }}
              variant="default"
            >
              {copyState === 'copied' ? 'Copied' : 'Copy link'}
            </Button>
          </Group>
          {copyState === 'copied' && <Text c="dimmed" role="status" size="sm">Link copied. Access has not changed.</Text>}
          {copyState === 'manual' && (
            <>
              <TextInput autoFocus label="Document link" onFocus={(event) => event.currentTarget.select()} readOnly value={link} />
              <Text c="dimmed" role="status" size="sm">Select and copy this link. Access stays the same.</Text>
            </>
          )}
        </Stack>

        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">Done</Button>
        </Group>
      </Stack>
    </RemdoDialog>
  );
}
