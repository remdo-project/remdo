import { IconChevronDown, IconPlus, IconUpload } from '@tabler/icons-react';
import type { ChangeEvent, ReactNode } from 'react';
import { useRef } from 'react';
import {
  Button,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Separator,
} from 'react-aria-components';
import type { DocumentSourceNote } from '#note-sdk';
import { ZoomBreadcrumbs } from '#client/editor/view/workspace';
import type { NotePathItem } from '#client/editor/view/workspace';
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
  onSelectHome,
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
  onSelectHome: () => void;
  onSelectNoteId: (noteId: string | null) => void;
  onStatusHostChange: (host: HTMLDivElement | null) => void;
  onUploadDocument: (file: File) => void;
  path: NotePathItem[];
  searchControl: ReactNode;
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const documentGroups = documentSources.map((source) => ({
    id: source.id(),
    label: source.text(),
    options: source.documents().children().map((document) => ({
      active: document.id() === docId && source.id() === currentSourceId,
      label: formatNavigationLabel(document.text()),
      value: document.id(),
    })),
  })).filter((source) => source.options.length > 0);

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
            <MenuTrigger>
              <Button
                aria-label="Choose document"
                className="document-header-doc-menu remdo-interaction-surface"
                isDisabled={documentGroups.length === 0}
              >
                <IconChevronDown aria-hidden="true" size={14} />
              </Button>
              <Popover className="document-header-doc-popover" offset={4} placement="bottom start">
                <Menu aria-label="Documents" className="document-header-doc-dropdown">
                  {documentGroups.map((group) => (
                    <MenuSection
                      data-document-source-id={group.id}
                      id={group.id}
                      key={group.id}
                    >
                      <Header className="document-header-doc-group-label">{group.label}</Header>
                      {group.options.map((document) => (
                        <MenuItem
                          data-active={document.active || undefined}
                          data-document-ref={document.value}
                          id={`${group.id}:${document.value}`}
                          key={`${group.id}:${document.value}`}
                          onAction={() => onSelectDocument(document.value)}
                          textValue={document.label}
                        >
                          {document.label}
                        </MenuItem>
                      ))}
                    </MenuSection>
                  ))}
                  <Separator />
                  <MenuItem id={NEW_DOCUMENT_VALUE} onAction={onCreateDocument} textValue="New">
                    <span className="document-header-doc-action">
                      <IconPlus aria-hidden="true" size={14} />
                      <span>New</span>
                    </span>
                  </MenuItem>
                  <MenuItem
                    id={UPLOAD_DOCUMENT_VALUE}
                    onAction={() => uploadInputRef.current?.click()}
                    textValue="Upload"
                  >
                    <span className="document-header-doc-action">
                      <IconUpload aria-hidden="true" size={14} />
                      <span>Upload</span>
                    </span>
                  </MenuItem>
                </Menu>
              </Popover>
            </MenuTrigger>
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
