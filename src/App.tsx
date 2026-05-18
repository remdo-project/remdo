import { Anchor, Container, Group, Title } from '@mantine/core';
import { useEffect } from 'react';
import { Link, Outlet, useParams, useSearchParams } from 'react-router-dom';
import headerStyles from './styles/AppHeader.module.css';
import { config } from '#config';
import { logoutCurrentUser } from './auth/logout';
import { startUserConfig } from './documents/user-config';
import { createDocumentPath, parseDocumentRef } from './routing';
import VanillaLexicalEditor from './editor/dev/VanillaLexicalEditor';
import { DevToolbarLinks } from './routes/DevToolbar';

export default function App() {
  const { docRef } = useParams<{ docRef?: string }>();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    startUserConfig();
  }, []);
  const showVanillaLexical = config.isDevOrTest && searchParams.has('lexicalDemo');
  const parsedRef = parseDocumentRef(docRef);
  const currentDocumentPath = parsedRef ? createDocumentPath(parsedRef.docId) : '/home';
  const handleLogoutClick = () => {
    void logoutCurrentUser().then(() => {
      globalThis.location.assign('/login');
    }, () => null);
  };

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
            <Anchor
              className="app-header-link"
              component="button"
              onClick={handleLogoutClick}
              type="button"
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
