import { Button as FormButton, Group, Stack, TextInput } from '@mantine/core';
import { useRef, useState } from 'react';
import { DOCUMENT_TITLE_MAX_LENGTH } from '#domain/documents/user-data';
import { RemdoDialog } from '#client/ui/RemdoDialog';

function suggestDocumentName(existingNames: readonly string[]): string {
  const names = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  let suggestion = 'New Document';
  for (let suffix = 1; names.has(suggestion.toLowerCase()); suffix += 1) {
    suggestion = `New Document ${suffix}`;
  }
  return suggestion;
}

export function DocumentCreateDialog({
  existingNames,
  onClose,
  onCreate,
}: {
  existingNames: readonly string[];
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => suggestDocumentName(existingNames));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const selectedOnOpenRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (pendingRef.current) return;
    inputRef.current?.focus();
    const title = draft.trim();
    if (!title) {
      setError('Enter a document name.');
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await onCreate(title);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the document. Try again.');
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <RemdoDialog isDismissable={!pending} onClose={onClose} title="New document">
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Stack gap="md">
          <TextInput
            autoFocus
            description="You can rename it later."
            error={error}
            errorProps={{ role: 'alert' }}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            label="Document name"
            maxLength={DOCUMENT_TITLE_MAX_LENGTH}
            onChange={(event) => { setDraft(event.currentTarget.value); setError(null); }}
            onFocus={(event) => {
              if (selectedOnOpenRef.current) return;
              selectedOnOpenRef.current = true;
              event.currentTarget.select();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
            }}
            readOnly={pending}
            ref={inputRef}
            value={draft}
          />
          {pending && <span role="status">Creating…</span>}
          <Group gap={8} justify="flex-end">
            <FormButton disabled={pending} onClick={onClose} variant="default">Cancel</FormButton>
            <FormButton disabled={pending} type="submit">Create document</FormButton>
          </Group>
        </Stack>
      </form>
    </RemdoDialog>
  );
}
