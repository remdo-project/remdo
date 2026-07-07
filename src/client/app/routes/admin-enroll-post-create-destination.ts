interface AdminEnrollPostCreateDestination {
  kind: 'navigate';
  path: string;
}

// After enrolling, the new admin's next step is the admin panel, so land there by
// default rather than preserving a pre-enrollment `next`. Enrollment creates a
// new account; resuming an earlier target can point at stale data or a previous
// identity's document.
export function resolveAdminEnrollPostCreateDestination(
  _search: string,
  _currentOrigin: string,
): AdminEnrollPostCreateDestination {
  return {
    kind: 'navigate',
    path: '/admin',
  };
}
