import { Anchor, Container, Group, Title } from '@mantine/core';
import { useEffect } from 'react';
import { Link, Outlet, useParams, useSearchParams } from 'react-router-dom';
import headerStyles from './styles/AppHeader.module.css';
import { config } from '#config';
import { startUserData, useCurrentUserRole } from './documents/user-data';
import { createDocumentPath, parseDocumentRef } from '#document-routes';
import VanillaLexicalEditor from '#client/editor/dev/VanillaLexicalEditor';
import { DevToolbarLinks } from './routes/DevToolbar';

export default function App() {
  const { docRef } = useParams<{ docRef?: string }>();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    startUserData();
  }, []);
  const showVanillaLexical = config.isDevOrTest && searchParams.has('lexicalDemo');
  const parsedRef = parseDocumentRef(docRef);
  const currentDocumentPath = parsedRef ? createDocumentPath(parsedRef.docId) : '/home';
  // Surface the admin panel link only to admins; route access stays enforced
  // server-side. Reactive to the bootstrap load so it appears once the role is known.
  const isAdmin = useCurrentUserRole() === 'admin';

  return (
    <Container size="xl" py="xl">
      <header className="app-header">
        <Group gap="md">
          <Title order={1} className="app-heading-title">
            <Link
              to="/home"
              className={headerStyles.brandLink}
            >
              <span aria-hidden="true" className={headerStyles.brandIcon} />
              RemDo
            </Link>
          </Title>
        </Group>
        <nav>
          <Group gap="md" className="app-header-links">
            {isAdmin && (
              <Anchor
                className="app-header-link"
                href="/admin"
              >
                Admin
              </Anchor>
            )}
            <Anchor
              className="app-header-link"
              href="/sharing"
            >
              Sharing
            </Anchor>
            <Anchor
              className="app-header-link"
              href="/logout"
            >
              Logout
            </Anchor>
            <DevToolbarLinks currentDocumentPath={currentDocumentPath} />
          </Group>
        </nav>
      </header>

      {showVanillaLexical && <VanillaLexicalEditor />}
      <Outlet />
    </Container>
  );
}
