import { Button as FormButton, Group, Stack, TextInput } from '@mantine/core';
import { useRef, useState } from 'react';
import { DOCUMENT_TITLE_MAX_LENGTH } from '#domain/documents/user-data';
import { RemdoDialog } from '#client/ui/RemdoDialog';

const NOUNS = {
  document: { lower: 'document', title: 'Document' },
  workspace: { lower: 'workspace', title: 'Workspace' },
};

function suggestName(base: string, existingNames: readonly string[]): string {
  const names = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  let suggestion = base;
  for (let suffix = 1; names.has(suggestion.toLowerCase()); suffix += 1) {
    suggestion = `${base} ${suffix}`;
  }
  return suggestion;
}

export function DocumentCreateDialog({
  existingNames,
  kind = 'document',
  onClose,
  onCreate,
}: {
  existingNames: readonly string[];
  kind?: keyof typeof NOUNS;
  onClose: () => void;
  onCreate: (title: string) => Promise<unknown>;
}) {
  const noun = NOUNS[kind];
  const [draft, setDraft] = useState(() => suggestName(`New ${noun.title}`, existingNames));
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
      setError(`Enter a ${noun.lower} name.`);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await onCreate(title);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : `Could not create the ${noun.lower}. Try again.`);
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <RemdoDialog isDismissable={!pending} onClose={onClose} title={`New ${noun.lower}`}>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Stack gap="md">
          <TextInput
            autoFocus
            description="You can rename it later."
            error={error}
            errorProps={{ role: 'alert' }}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            label={`${noun.title} name`}
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
            <FormButton disabled={pending} type="submit">Create {noun.lower}</FormButton>
          </Group>
        </Stack>
      </form>
    </RemdoDialog>
  );
}
