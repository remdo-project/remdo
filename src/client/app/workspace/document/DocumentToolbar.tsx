import { IconChevronDown } from '@tabler/icons-react';
import type { ReactNode } from 'react';
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
import { formatNavigationLabel } from '#client/ui/navigation-label';

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
      filterText: formatNavigationLabel(document.text(), Number.POSITIVE_INFINITY),
      label: formatNavigationLabel(document.text()),
      value: document.id(),
    })),
  })).filter((source) => source.options.length > 0);
  const selectedText = formatNavigationLabel(documentLabel, Number.POSITIVE_INFINITY);
  const selectedLabel = formatNavigationLabel(documentLabel);
  const currentListed = documentGroups.some((group) =>
    group.options.some((document) => document.value === docId),
  );
  const selectCurrentDocument = () => {
    onSelectDocument(docId);
  };

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
              key={docId}
              defaultFilter={(textValue, inputValue) => {
                if (inputValue.length === 0 || inputValue === selectedText) {
                  return true;
                }
                return textValue.toLowerCase().includes(inputValue.toLowerCase());
              }}
              menuTrigger="focus"
              onChange={(key) => {
                if (key != null && String(key) !== docId) {
                  onSelectDocument(String(key));
                }
              }}
              onOpenChange={(isOpen) => {
                if (isOpen) {
                  requestAnimationFrame(() => inputRef.current?.select());
                }
              }}
              value={docId}
            >
              <div className="document-header-doc-combo remdo-interaction-surface">
                <Input
                  className="document-header-doc-input"
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') {
                      return;
                    }
                    const activeId = event.currentTarget.getAttribute('aria-activedescendant');
                    if (activeId == null) {
                      selectCurrentDocument();
                      return;
                    }
                    const option = document.getElementById(activeId);
                    if (option?.getAttribute('data-document-ref') === docId) {
                      selectCurrentDocument();
                    }
                  }}
                  ref={inputRef}
                />
                <Button aria-label="Show documents" className="document-header-doc-menu">
                  <IconChevronDown aria-hidden="true" size={14} />
                </Button>
              </div>
              <Popover offset={4} placement="bottom start">
                <ListBox className="document-header-doc-dropdown remdo-menu">
                  {currentListed ? null : (
                    <ListBoxItem
                      data-document-ref={docId}
                      id={docId}
                      onPress={selectCurrentDocument}
                      textValue={selectedText}
                    >
                      {selectedLabel}
                    </ListBoxItem>
                  )}
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
                          id={document.value}
                          key={`${group.id}:${document.value}`}
                          onPress={document.value === docId ? selectCurrentDocument : undefined}
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
