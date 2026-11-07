#!/usr/bin/env bash
# Static analysis of the shell scripts under deploy/ and komodo/.
# Starts at severity "warning" so it passes today; tighten later.
set -Eeuo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "${REPO_ROOT}"

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck is not installed (apt install shellcheck / brew install shellcheck)" >&2
  exit 1
fi

files=()
while IFS= read -r f; do files+=("$f"); done \
  < <(find deploy komodo .github/scripts test/shell -name '*.sh' -type f | sort)

echo "shellcheck $(shellcheck --version | awk '/^version:/{print $2}') over ${#files[@]} files"
shellcheck -x --source-path=SCRIPTDIR --severity=warning "${files[@]}"
echo "all clean"
