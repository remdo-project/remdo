import { IconChevronDown } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
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
  const filterEditedRef = useRef(false);
  const [filterQuery, setFilterQuery] = useState<string | null>(null);
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
                if (filterQuery == null || inputValue.length === 0) {
                  return true;
                }
                return textValue.toLowerCase().includes(filterQuery.toLowerCase());
              }}
              inputValue={filterQuery ?? selectedText}
              menuTrigger="focus"
              onInputChange={(value) => {
                if (value !== selectedText) {
                  filterEditedRef.current = true;
                }
                setFilterQuery((current) => {
                  if (current !== null) {
                    return value;
                  }
                  return value === selectedText ? null : value;
                });
              }}
              onChange={(key) => {
                if (key == null) {
                  return;
                }
                const id = String(key);
                if (id !== docId || !filterEditedRef.current) {
                  onSelectDocument(id);
                }
              }}
              onOpenChange={(isOpen) => {
                setFilterQuery(null);
                filterEditedRef.current = false;
                if (isOpen) {
                  requestAnimationFrame(() => {
                    // RAC may sync the input when opening; that is not a user edit.
                    filterEditedRef.current = false;
                    inputRef.current?.select();
                  });
                }
              }}
              value={docId}
            >
              <div className="document-header-doc-combo remdo-interaction-surface">
                <Input className="document-header-doc-input" ref={inputRef} />
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
                      onPress={() => onSelectDocument(docId)}
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
                          onPress={() => {
                            if (document.value === docId) {
                              onSelectDocument(document.value);
                            }
                          }}
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
