import { Avatar, Button, Group, InputBase, Stack, Text, TextInput, VisuallyHidden } from '@mantine/core';
import { IconCheck, IconLink, IconLock } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { ComboBox, Input, ListBox, ListBoxItem, Popover } from 'react-aria-components';
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
    return {
      name: note.getText(),
      owner: note.canShareWith(),
      recipients: note.getAccess().getChildren(),
      suggestions: note.getSharingSuggestions(),
    };
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
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [emailFormat, setEmailFormat] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [state, setState] = useState<ShareState>({ status: 'idle' });
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const pending = state.status === 'pending';
  const owner = sharing?.owner ?? openingOwner;
  const recipients = sharing?.recipients ?? [];
  const validEmailFormat = emailFormat === 'valid' && state.status === 'idle';
  const emailError = state.status === 'error'
    ? state.message
    : emailFormat === 'invalid'
      ? (email.trim() ? 'Enter a valid email address.' : 'Enter an email address.')
      : null;
  const link = new URL(createDocumentPath(note.getId()), window.location.origin).href;
  const suggestions = sharing?.suggestions ?? [];
  const suggestionSearchText = new Map(suggestions.map((person) => [person.email, `${person.name || ''} ${person.email}`]));

  useLayoutEffect(() => {
    if (emailInputRef.current?.validity.valid) setEmailFormat('valid');
  }, [email]);

  const changeEmail = (value: string) => {
    setEmail(value);
    setEmailFormat(previous => previous === 'invalid' && email.trim() && value.trim() ? 'invalid' : 'idle');
    setState({ status: 'idle' });
  };

  const submit = async () => {
    const recipient = email.trim();
    if (!recipient) return;
    const alreadyShared = recipients.some((access) => access.getEmail().toLowerCase() === recipient.toLowerCase());
    setState({ status: 'pending' });
    try {
      const access = await note.shareWith(recipient);
      setEmail('');
      setSelectedContactId(null);
      setEmailFormat('idle');
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
      await navigator.clipboard.writeText(link);
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
              <ComboBox
                allowsCustomValue
                aria-label="Add a person by email"
                autoFocus
                defaultFilter={(address, query) => Boolean(query.trim()) && (suggestionSearchText.get(address) ?? '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())}
                inputValue={email}
                isDisabled={pending}
                onChange={(key) => {
                  const person = suggestions.find((contact) => contact.userId === key);
                  setSelectedContactId(person?.userId ?? null);
                  if (person) changeEmail(person.email);
                }}
                onInputChange={(value) => {
                  setSelectedContactId(null);
                  changeEmail(value);
                }}
                value={selectedContactId}
              >
                <InputBase
                  className="document-share-email"
                  component={Input}
                  data-format-valid={validEmailFormat || undefined}
                  description={(
                    <>
                      Needs an account on this RemDo server. Can edit and rename; cannot invite others. No email is sent.
                      {validEmailFormat && <VisuallyHidden>Valid email format</VisuallyHidden>}
                      <span className="document-share-email-feedback">
                        {emailError && <span role="alert">{emailError}</span>}
                      </span>
                    </>
                  )}
                  disabled={pending}
                  error={Boolean(emailError)}
                  label="Add a person by email"
                  onBlur={(event) => {
                    setEmailFormat(event.currentTarget.value.trim() ? (event.currentTarget.validity.valid ? 'valid' : 'invalid') : 'idle');
                  }}
                  onInvalid={(event) => {
                    event.preventDefault();
                    setEmailFormat('invalid');
                    event.currentTarget.focus();
                  }}
                  pattern={String.raw`.+@(?:localhost|.+\..+)`}
                  ref={emailInputRef}
                  required
                  rightSection={validEmailFormat ? <Icon color="var(--mantine-color-green-4)" icon={IconCheck} size={18} /> : null}
                  rightSectionPointerEvents="none"
                  type="email"
                />
                <Popover className="document-share-suggestions" offset={4} placement="bottom start">
                  <ListBox aria-label="People from sharing" className="document-share-suggestions-list">
                    {suggestions.map((person) => (
                      <ListBoxItem
                        aria-label={person.name ? `${person.name}, ${person.email}` : person.email}
                        className="document-share-suggestion"
                        id={person.userId}
                        key={person.userId}
                        textValue={person.email}
                      >
                        <span className="document-share-suggestion-name">{person.name || person.email}</span>
                        {person.name && <span className="document-share-suggestion-email">{person.email}</span>}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Popover>
              </ComboBox>
              <Button className="document-share-add" color="violet" loading={pending} style={{ alignSelf: 'flex-start' }} type="submit">Add access</Button>
              {email.trim() && state.status === 'idle' && !emailError && <Text c="dimmed" size="sm">Not added yet. Select Add access.</Text>}
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
          <Button onClick={onClose} variant="default">Close</Button>
        </Group>
      </Stack>
    </RemdoDialog>
  );
}
