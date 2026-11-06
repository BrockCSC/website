#!/usr/bin/env bash
# Run the bats suite for the deploy scripts.
set -Eeuo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "${REPO_ROOT}"

if ! command -v bats >/dev/null 2>&1; then
  echo "bats is not installed (apt install bats / brew install bats-core)" >&2
  exit 1
fi

echo "$(bats --version) over test/shell"
exec bats --print-output-on-failure test/shell
