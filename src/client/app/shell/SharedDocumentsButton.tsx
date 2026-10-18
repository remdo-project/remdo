import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Button, Dialog, DialogTrigger, Heading, Popover, Tooltip, TooltipTrigger } from 'react-aria-components';
import { IconBell, IconUsers } from '@tabler/icons-react';
import { createDocumentPath } from '#document-routes';
import { useUserDataRead } from '#client/app/user-data/use-user-data-read';
import { Icon } from '#client/ui/Icon';
import { formatNavigationLabel } from '#client/ui/navigation-label';
import './SharedDocumentsButton.css';

export function SharedDocumentsButton({ host }: { host: HTMLElement | null }) {
  if (!host) return null;

  return createPortal(
    <DialogTrigger>
      <TooltipTrigger>
        <Button aria-label="Shared with you" className="shared-documents-button">
          <Icon icon={IconBell} size={20} />
        </Button>
        <Tooltip className="remdo-tooltip" placement="bottom">Shared with you</Tooltip>
      </TooltipTrigger>
      <Popover className="shared-documents-popover" offset={8} placement="bottom end">
        <Dialog className="shared-documents-dialog">
          {({ close }) => <SharedDocumentsPanel close={close} />}
        </Dialog>
      </Popover>
    </DialogTrigger>,
    host,
  );
}

function SharedDocumentsPanel({ close }: { close: () => void }) {
  const { data: documents = [], loading, error, retry } = useUserDataRead(
    userData => userData.documents.getChildren().filter(note => !note.canShareWith()),
  );
  return (
    <>
      <Heading className="shared-documents-title" slot="title">Shared with you</Heading>
      <p className="shared-documents-description">Documents you already have access to.</p>
      {error && (
        <div className="shared-documents-error" role="alert">
          <p>{error}</p>
          <Button onPress={retry}>Retry</Button>
        </div>
      )}
      <ul className="shared-documents-list">
        {documents.map((note) => (
          <li key={note.getId()}>
            <Link onClick={close} to={createDocumentPath(note.getId())}>
              <Icon icon={IconUsers} size={18} />
              <span>
                <span className="shared-document-name">{formatNavigationLabel(note.getText(), Number.POSITIVE_INFINITY)}</span>
                <span className="shared-document-detail">Can edit · Open document</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {documents.length === 0 && !error && (
        <p className="shared-documents-empty">{loading ? 'Loading documents…' : 'Nothing shared with you yet.'}</p>
      )}
    </>
  );
}
