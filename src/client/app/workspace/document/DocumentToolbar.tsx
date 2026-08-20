import { IconChevronDown } from '@tabler/icons-react';
import type { Key, ReactNode } from 'react';
import { useRef } from 'react';
import {
  Button,
  ComboBox,
  Header,
  Input,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
} from 'react-aria-components';
import type { DocumentSourceNote } from '#note-sdk';
import { ZoomBreadcrumbs } from '#client/editor/view/workspace';
import type { NotePathItem } from '#client/editor/view/workspace';
import { formatNavigationLabel, normalizeNavigationLabel, UNTITLED_LABEL } from '#client/ui/navigation-label';

function documentFilterText(raw: string): string {
  const normalized = normalizeNavigationLabel(raw);
  return normalized.length > 0 ? normalized : UNTITLED_LABEL;
}

function documentIdFromKey(key: Key): string {
  const value = String(key);
  const separator = value.indexOf(':');
  return separator === -1 ? value : value.slice(separator + 1);
}

export default function DocumentToolbar({
  docId,
  documentLabel,
  documentSources,
  onSelectDocument,
  onSelectHome,
  onSelectNoteId,
  onStatusHostChange,
  path,
  searchControl,
}: {
  docId: string;
  documentLabel: string;
  documentSources: readonly DocumentSourceNote[];
  onSelectDocument: (docId: string) => void;
  onSelectHome: () => void;
  onSelectNoteId: (noteId: string | null) => void;
  onStatusHostChange: (host: HTMLDivElement | null) => void;
  path: NotePathItem[];
  searchControl: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const documentGroups = documentSources.map((source) => ({
    id: source.id(),
    label: source.text(),
    options: source.documents().children().map((document) => ({
      filterText: documentFilterText(document.text()),
      label: formatNavigationLabel(document.text()),
      value: document.id(),
    })),
  })).filter((source) => source.options.length > 0);
  const selectedKey = documentGroups
    .flatMap((group) => group.options.map((document) => ({
      key: `${group.id}:${document.value}`,
      filterText: document.filterText,
      value: document.value,
    })))
    .find((document) => document.value === docId);
  const selectedText = selectedKey?.filterText ?? documentFilterText(documentLabel);

  return (
    <header className="document-header">
      <div className="document-header-breadcrumbs">
        <ZoomBreadcrumbs
          docLabel={documentLabel}
          documentControl={(
            <ComboBox
              allowsEmptyCollection
              aria-label="Choose document"
              className="document-header-doc-combobox"
              defaultFilter={(textValue, inputValue) => {
                if (inputValue === selectedText || inputValue.length === 0) {
                  return true;
                }
                return textValue.toLowerCase().includes(inputValue.toLowerCase());
              }}
              isDisabled={documentGroups.length === 0}
              menuTrigger="focus"
              onOpenChange={(isOpen) => {
                if (isOpen) {
                  requestAnimationFrame(() => inputRef.current?.select());
                }
              }}
              onChange={(key) => {
                if (key == null) {
                  return;
                }
                const nextDocId = documentIdFromKey(key);
                if (nextDocId !== docId) {
                  onSelectDocument(nextDocId);
                }
              }}
              value={selectedKey?.key ?? null}
            >
              <div className="document-header-doc-combo remdo-interaction-surface">
                <Input className="document-header-doc-input" ref={inputRef} />
                <Button aria-label="Show documents" className="document-header-doc-menu">
                  <IconChevronDown aria-hidden="true" size={14} />
                </Button>
              </div>
              <Popover offset={4} placement="bottom start">
                <ListBox className="document-header-doc-dropdown remdo-menu">
                  {documentGroups.map((group) => (
                    <ListBoxSection
                      data-document-source-id={group.id}
                      id={group.id}
                      key={group.id}
                    >
                      <Header>{group.label}</Header>
                      {group.options.map((document) => (
                        <ListBoxItem
                          data-document-ref={document.value}
                          id={`${group.id}:${document.value}`}
                          key={`${group.id}:${document.value}`}
                          onAction={document.value === docId
                            ? () => onSelectDocument(docId)
                            : undefined}
                          textValue={document.filterText}
                        >
                          {document.label}
                        </ListBoxItem>
                      ))}
                    </ListBoxSection>
                  ))}
                </ListBox>
              </Popover>
            </ComboBox>
          )}
          path={path}
          onSelectHome={onSelectHome}
          onSelectNoteId={onSelectNoteId}
        />
      </div>
      <div className="document-header-actions">
        {searchControl}
        <div className="document-header-status" ref={onStatusHostChange} />
      </div>
    </header>
  );
}
