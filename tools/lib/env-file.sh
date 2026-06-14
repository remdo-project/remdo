#!/usr/bin/env sh
# Shared dotenv loader. Source from scripts; do not exec directly.

remdo_load_dotenv_file() {
  env_file="$1"

  if [ ! -f "${env_file}" ]; then
    return 0
  fi

  while IFS= read -r assignment || [ -n "${assignment}" ]; do
    case "${assignment}" in
      '' | '#'*) continue ;;
      export\ *) assignment="${assignment#export }" ;;
    esac

    key="${assignment%%=*}"
    case "${key}" in
      '' | [0-9]* | *[!A-Za-z0-9_]*) continue ;;
    esac

    eval '[ "${'"${key}"'+x}" = x ]' && continue
    eval "export ${assignment}"
  done < "${env_file}"
}
