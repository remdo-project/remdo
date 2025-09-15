#!/bin/bash

# Minimal utility helpers used by npm scripts.

# Help message
function wrong_usage {
    cat <<USAGE
Usage: $0 <command> [args]

Commands:
  run_serialization <load|save> <serialization_file> [extra vitest args]
  open_document <path/to/file>
USAGE
    exit 1
}

function run_serialization {
    if [ "$#" -lt 2 ]; then
        echo "Usage: $0 run_serialization [load|save] [serialization_file]"
        exit 1
    fi
    # disable API to not compete for the port with the main test instance
    VITEST_SERIALIZATION_FILE=$2 VITE_LOG_LEVEL="info" FORCE_WEBSOCKET="true" npx vitest run serialization --api=false -t $1 $3
}

# loads data from the file and saves it back repeatedly
function open_document {
    process_group_id=""

    cleanup() {
        echo "Killing all child processes..."
        kill -- -$process_group_id
        exit 0
    }

    trap cleanup SIGINT

    FILE=$1
    echo "Loading $FILE"
    npm run load $FILE
    while true; do
        echo "Saving $FILE"
        sleep 1

        `npm run save $FILE -- &>/dev/null` &
        process_group_id=$!
        wait $!

        git -C `dirname $FILE` diff --stat | grep `basename $FILE`
    done
}

if [ "$#" -eq 0 ]; then
    wrong_usage
fi

# launch command provided as the first argument and pass remaining arguments
case "$1" in
  run_serialization|open_document)
    "$1" "${@:2}"
    ;;
  *)
    wrong_usage
    ;;
esac

