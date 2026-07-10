import { ActionIcon, Combobox, useCombobox } from '@mantine/core';
import { IconChevronDown, IconPlus, IconUpload } from '@tabler/icons-react';
import type { ChangeEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { ZoomBreadcrumbs } from '#client/editor/features/zoom/ZoomBreadcrumbs';
import type { DocumentSourceNote } from '#note-sdk';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import { formatNavigationLabel } from '#client/ui/navigation-label';

const NEW_DOCUMENT_VALUE = '$new-document';
const UPLOAD_DOCUMENT_VALUE = '$upload-document';

export default function DocumentToolbar({
  currentSourceId,
  docId,
  documentLabel,
  documentSources,
  onCreateDocument,
  onSelectDocument,
  onSelectNoteId,
  onStatusHostChange,
  onUploadDocument,
  path,
  searchControl,
}: {
  currentSourceId: string | null;
  docId: string;
  documentLabel: string;
  documentSources: readonly DocumentSourceNote[];
  onCreateDocument: () => void;
  onSelectDocument: (docId: string) => void;
  onSelectNoteId: (noteId: string | null) => void;
  onStatusHostChange: (host: HTMLDivElement | null) => void;
  onUploadDocument: (file: File) => void;
  path: NotePathItem[];
  searchControl: ReactNode;
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const documentPicker = useCombobox({
    onDropdownClose: () => documentPicker.resetSelectedOption(),
  });
  const documentGroups = documentSources.map((source) => ({
    id: source.id(),
    label: source.text(),
    options: source.documents().children().map((document) => ({
      active: document.id() === docId && source.id() === currentSourceId,
      label: formatNavigationLabel(document.text()),
      value: document.id(),
    })),
  })).filter((source) => source.options.length > 0);
  const documentOptionsCount = documentGroups.reduce((count, group) => count + group.options.length, 0);

  const handleUploadInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (file) {
      onUploadDocument(file);
    }
  };

  return (
    <header className="document-header">
      <div className="document-header-breadcrumbs">
        <ZoomBreadcrumbs
          docLabel={documentLabel}
          documentControl={(
            <Combobox
              offset={{ mainAxis: 4, crossAxis: -44 }}
              onOptionSubmit={(value) => {
                documentPicker.closeDropdown();
                if (value === NEW_DOCUMENT_VALUE) {
                  onCreateDocument();
                  return;
                }
                if (value === UPLOAD_DOCUMENT_VALUE) {
                  uploadInputRef.current?.click();
                  return;
                }
                onSelectDocument(value);
              }}
              position="bottom-start"
              shadow="md"
              store={documentPicker}
              withinPortal={false}
            >
              <Combobox.Target>
                <ActionIcon
                  aria-label="Choose document"
                  className="document-header-doc-menu remdo-interaction-surface"
                  disabled={documentOptionsCount === 0}
                  onClick={() => documentPicker.toggleDropdown()}
                  size="sm"
                  variant="subtle"
                >
                  <IconChevronDown aria-hidden="true" size={14} />
                </ActionIcon>
              </Combobox.Target>
              <Combobox.Dropdown className="document-header-doc-dropdown">
                <Combobox.Options>
                  {documentGroups.map((group) => (
                    <Combobox.Group
                      data-document-source-id={group.id}
                      key={group.id}
                      label={group.label}
                    >
                      {group.options.map((document) => (
                        <Combobox.Option
                          active={document.active}
                          data-document-ref={document.value}
                          key={`${group.id}:${document.value}`}
                          value={document.value}
                        >
                          {document.label}
                        </Combobox.Option>
                      ))}
                    </Combobox.Group>
                  ))}
                  <div aria-hidden="true" className="document-header-doc-divider document-header-doc-divider--dark-5" />
                  <Combobox.Option value={NEW_DOCUMENT_VALUE}>
                    <span className="document-header-doc-action">
                      <IconPlus aria-hidden="true" size={14} />
                      <span>New</span>
                    </span>
                  </Combobox.Option>
                  <Combobox.Option value={UPLOAD_DOCUMENT_VALUE}>
                    <span className="document-header-doc-action">
                      <IconUpload aria-hidden="true" size={14} />
                      <span>Upload</span>
                    </span>
                  </Combobox.Option>
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
          )}
          path={path}
          onSelectNoteId={onSelectNoteId}
        />
      </div>
      <div className="document-header-actions">
        {searchControl}
        <div className="document-header-status" ref={onStatusHostChange} />
      </div>
      <input
        accept="application/json,.json"
        aria-label="Upload document backup"
        className="document-header-upload-input"
        onChange={handleUploadInputChange}
        ref={uploadInputRef}
        type="file"
      />
    </header>
  );
}
