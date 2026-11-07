#!/usr/bin/env bats
# Tests for the helpers in .github/scripts/komodo.sh. curl is replaced by a
# stub that records the request body and answers from canned HTTP statuses, so
# no Komodo server is involved.

bats_require_minimum_version 1.5.0

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  STUB_DIR="$BATS_TEST_TMPDIR/bin"
  CURL_LOG="$BATS_TEST_TMPDIR/curl.log"
  mkdir -p "$STUB_DIR"
  # Reads the -o file and -d body from its arguments. GetVariable/GetStack
  # answer 404 when EXISTS=no, everything else 200 with {"ok":true}.
  cat > "$STUB_DIR/curl" <<'STUB'
#!/usr/bin/env bash
out="" body=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    -d) body="$2"; shift ;;
  esac
  shift
done
echo "$body" >> "$CURL_LOG"
status=200
case "$body" in
  *GetVariable*|*GetStack*) [ "${EXISTS:-yes}" = "yes" ] || status=404 ;;
esac
echo '{"ok":true}' > "$out"
printf '%s' "$status"
STUB
  chmod +x "$STUB_DIR/curl"
  PATH="$STUB_DIR:$PATH"
  export CURL_LOG KOMODO_HOST=http://komodo.test KOMODO_API_KEY=k KOMODO_API_SECRET=s
  # shellcheck source=../../.github/scripts/komodo.sh
  source "$REPO_ROOT/.github/scripts/komodo.sh"
}

@test "komodo: returns non-zero and reports the status on HTTP errors" {
  EXISTS=no run komodo /read '{"type":"GetVariable"}'
  [ "$status" -ne 0 ]
  [[ "$output" == *"HTTP 404"* ]]
}

@test "sync_var: updates a variable that exists" {
  EXISTS=yes run sync_var FOO bar true
  [ "$status" -eq 0 ]
  grep -q UpdateVariableValue "$CURL_LOG"
  ! grep -q CreateVariable "$CURL_LOG"
}

@test "sync_var: creates a missing variable with the secret flag" {
  EXISTS=no run sync_var FOO bar true
  [ "$status" -eq 0 ]
  grep -q CreateVariable "$CURL_LOG"
  grep -Eq '"is_secret": *true' "$CURL_LOG"
}

@test "komodo_ensure_and_deploy_stack: updates an existing stack before deploying" {
  komodo_await() { return 0; }
  EXISTS=yes run komodo_ensure_and_deploy_stack s1 '{"branch":"x"}' 1
  [ "$status" -eq 0 ]
  grep -q UpdateStack "$CURL_LOG"
  grep -q DeployStack "$CURL_LOG"
  ! grep -q CreateStack "$CURL_LOG"
}

@test "komodo_ensure_and_deploy_stack: creates a missing stack before deploying" {
  komodo_await() { return 0; }
  EXISTS=no run komodo_ensure_and_deploy_stack s1 '{"branch":"x"}' 1
  [ "$status" -eq 0 ]
  grep -q CreateStack "$CURL_LOG"
  grep -q DeployStack "$CURL_LOG"
}

@test "komodo_await: fails when the update has no id" {
  run komodo_await '{}' 1
  [ "$status" -ne 0 ]
  [[ "$output" == *"No update id"* ]]
}
