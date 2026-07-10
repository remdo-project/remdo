import { Outlet } from 'react-router-dom';
import UserDataRuntimeBoundary from './UserDataRuntimeBoundary';

// The authenticated app boundary starts the live user-data runtime. It mounts
// only for an authenticated user, so it starts the runtime unconditionally.
export default function AuthenticatedApp() {
  return (
    <UserDataRuntimeBoundary>
      <Outlet />
    </UserDataRuntimeBoundary>
  );
}
