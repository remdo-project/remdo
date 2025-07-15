import { execSync } from "child_process";
import path from "path";
import { test } from "@playwright/test";

function countPhraseInTrackedFiles(phrase) {
  const currentFile = path.relative(process.cwd(), __filename);
  const cmd = `git grep -i ${phrase} | grep -v "${currentFile}" | wc -l`;
  return parseInt(execSync(cmd).toString());
}

function countFiles() {
  const cmd = `./utils.sh repo_files | wc -l`;
  return parseInt(execSync(cmd).toString());
}

function countFilesByExtension() {
  const cmd = `./utils.sh repo_files | grep -v __snapshots__ | sed -e 's/.*\\.//' | sort | uniq -c | sort -rn | awk '{ printf "%s %s; ", $1, $2 }'`;
  return execSync(cmd).toString().trim();
}

function countCodeLines() {
  const cmd = `./utils.sh repo_files | \
      grep -v package-lock.json | \
      grep -v __snapshots__ | \
      grep -vE "^tests/data/" | \
      xargs wc -l | \
      tail -n 1 | \
      awk '{print $1}'`;
  return parseInt(execSync(cmd).toString());
}

const DEFAULT = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

test("code report", async () => {
  const filesCount = countFiles();
  const filesCountByExtension = countFilesByExtension();
  const linesCount = countCodeLines();
  const todoCount = countPhraseInTrackedFiles("todo");
  const fixmeCount = countPhraseInTrackedFiles("fixme");

  const report = `\
${BOLD}Code report${DEFAULT}
Files: ${GREEN}${filesCount}${DEFAULT} (${filesCountByExtension})
Lines: ${GREEN}${linesCount}${DEFAULT}
ToDo:  ${YELLOW}${todoCount}${DEFAULT}
FixMe: ${RED}${fixmeCount}${DEFAULT}`;
  console.log(report);
});
