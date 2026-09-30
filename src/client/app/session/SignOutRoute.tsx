import { Button } from '@mantine/core';
import { Link } from 'react-router-dom';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { useLogout } from './useLogout';

export default function SignOutRoute() {
  const { requestLogout } = useLogout();
  return (
    <CenteredCardPage title="Sign out of RemDo?" description="Signing out clears this device's local data.">
      <Button className="remdo-account-button" onClick={requestLogout}>Sign out</Button>
      <Button className="remdo-account-button" component={Link} to="/">Cancel</Button>
    </CenteredCardPage>
  );
}
