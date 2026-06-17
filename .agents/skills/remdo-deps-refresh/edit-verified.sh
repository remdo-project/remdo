# shellcheck shell=sh
# Shared helper for the tooling-pin bump scripts: apply a sed edit to a file,
# confirm the expected text is present afterwards (refusing to leave a
# half-applied file), and only write when the content actually changed — so
# callers can run every edit unconditionally and idempotently.
# Source with: . "${SCRIPT_DIR}/edit-verified.sh" (its sibling in the skill dir).

# edit_verified <file> <sed-expr> <must-contain>
#   returns 0 and writes if the edit changed the file and produced <must-contain>
#   returns 0 without writing if the file was already in the desired state
#   returns 1 (no write) if the edit did not produce <must-contain>
edit_verified() {
  _ev_file="$1"; _ev_expr="$2"; _ev_need="$3"
  _ev_tmp="$(mktemp)"

  if ! sed "${_ev_expr}" "${_ev_file}" > "${_ev_tmp}"; then
    rm -f "${_ev_tmp}"
    echo "edit_verified: sed failed on ${_ev_file}." >&2
    return 1
  fi
  if ! grep -qF "${_ev_need}" "${_ev_tmp}"; then
    rm -f "${_ev_tmp}"
    echo "edit_verified: edit of ${_ev_file} did not produce '${_ev_need}'; left untouched." >&2
    return 1
  fi

  if cmp -s "${_ev_tmp}" "${_ev_file}"; then
    rm -f "${_ev_tmp}"   # already in the desired state — no write
  else
    mv "${_ev_tmp}" "${_ev_file}"
  fi
}
