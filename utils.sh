#!/bin/bash

SCRIPT_PATH=$0

#launches this script in watch mode and auto executes test function on every change
function debug {
    $SCRIPT_PATH test
    SHELL=zsh npx chokidar $SCRIPT_PATH -c "$SCRIPT_PATH test"
}

#list files in thi git reporitory includes nedwly added and not commited yet
#but does not include submodules, neither ignored files
function repo_files {
    NEW_FILES=$(git ls-files --others --exclude-standard)
    TRACKED_FILES=$(git ls-files)
    if [ "$1" = "include_submodules" ]; then
        echo $NEW_FILES $TRACKED_FILES
    else
        SUBMODULES_REGEXP=$(git submodule foreach --quiet 'echo ^$path' | $SCRIPT_PATH list_to_regexp)
        echo "$NEW_FILES $TRACKED_FILES" |
          grep -Ev "$SUBMODULES_REGEXP" |
          cut -d ' ' -f 1 | #convert to one file per line
          grep -Ev '\.(mts|svg|png|ico|json)$' | #exclude some file types
          while read -r file; do # remove symlinks
            if [ ! -L "$file" ]; then
              echo "$file"
            fi
          done
    fi
}

#converts list of files to regexp
function list_to_regexp {
    cat | tr '\n' '|' | sed 's/|$//'
}

#exclude data/ dir as symlink placed there causes firing commant twice
function watch_repo {
    IGNORED=$(git ls-files --others --ignored --exclude-standard --directory | sed 's/\/$//' | $SCRIPT_PATH list_to_regexp)
    echo $IGNORED
    SHELL=zsh npx chokidar . --ignore "$IGNORED|data" -c "$1"
}

#test function, modify it as you like
function test {
    clear
    echo "testing"
}

#help message
function wrong_usage {
    echo "Usage: $SCRIPT_PATH [function], where function is one of:"
    egrep "^function" $SCRIPT_PATH | grep -v wrong_usage | awk '{print " "$2}'
    exit 1
}

function run_serialization {
    if [ "$#" -lt 2 ]; then
        echo "Usage: $SCRIPT_PATH run_serialization [load|save] [serialization_file]"
        exit 1
    fi
    #disable API to not compete for the port with the main test instance
    VITEST_SERIALIZATION_FILE=$2 VITE_LOG_LEVEL="info" VITE_WS="true" npx vitest run serialization --api=false -t $1 $3
}

#loads data from the file and saves it back repeatedly
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

#launch command provided as the first argument and pass all remaining arguments
$1 "${@:2}"
