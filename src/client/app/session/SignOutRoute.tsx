import { Button } from '@mantine/core';
import { Link } from 'react-router-dom';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { useLogout } from './useLogout';

export default function SignOutRoute() {
  const { requestLogout } = useLogout();
  return (
    <CenteredCardPage title="Sign out of RemDo?" description="Signing out clears this device's local data.">
      <Button onClick={requestLogout}>Sign out</Button>
      <Button component={Link} to="/" variant="default">Cancel</Button>
    </CenteredCardPage>
  );
}
