#!/usr/bin/env bats
# Tests for deploy/drop-db.sh and deploy/ssh-dispatch.sh.
# sudo is replaced by a stub on PATH that records its arguments, so nothing
# touches docker or a database.

bats_require_minimum_version 1.5.0

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  STUB_DIR="$BATS_TEST_TMPDIR/bin"
  SUDO_LOG="$BATS_TEST_TMPDIR/sudo.log"
  mkdir -p "$STUB_DIR"
  cat > "$STUB_DIR/sudo" <<STUB
#!/bin/sh
echo "\$*" >> "$SUDO_LOG"
STUB
  chmod +x "$STUB_DIR/sudo"
  PATH="$STUB_DIR:$PATH"
}

# drop-db.sh

@test "drop-db: no argument prints usage and fails" {
  run sh "$REPO_ROOT/deploy/drop-db.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"usage: drop-db.sh"* ]]
}

@test "drop-db: refuses a schema without the preview_ prefix" {
  for name in public prod dev uat brockcsc; do
    run sh "$REPO_ROOT/deploy/drop-db.sh" "$name"
    [ "$status" -eq 1 ]
    [[ "$output" == *"can only drop preview_* schemas"* ]]
  done
  [ ! -e "$SUDO_LOG" ]
}

@test "drop-db: refuses invalid characters in the schema name" {
  for name in 'preview_a-b' 'preview_A' 'preview_a;b' 'preview_a b' 'preview_"x'; do
    run sh "$REPO_ROOT/deploy/drop-db.sh" "$name"
    [ "$status" -eq 1 ]
    [[ "$output" == *"invalid schema name"* ]]
  done
  [ ! -e "$SUDO_LOG" ]
}

@test "drop-db: valid preview schema runs one quoted DROP SCHEMA through docker exec" {
  run sh "$REPO_ROOT/deploy/drop-db.sh" preview_my_branch_1
  [ "$status" -eq 0 ]
  [ "$(wc -l < "$SUDO_LOG")" -eq 1 ]
  grep -q '^docker exec postgres psql -U brockcsc -d brockcsc -c DROP SCHEMA IF EXISTS "preview_my_branch_1" CASCADE$' "$SUDO_LOG"
}

# ssh-dispatch.sh

@test "ssh-dispatch: unknown command is rejected" {
  SSH_ORIGINAL_COMMAND="rm -rf /" run sh "$REPO_ROOT/deploy/ssh-dispatch.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown command"* ]]
}

@test "ssh-dispatch: empty command is rejected" {
  SSH_ORIGINAL_COMMAND="" run sh "$REPO_ROOT/deploy/ssh-dispatch.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown command"* ]]
}

@test "ssh-dispatch: unset command is rejected" {
  unset SSH_ORIGINAL_COMMAND
  run sh "$REPO_ROOT/deploy/ssh-dispatch.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown command"* ]]
}

@test "ssh-dispatch: drop-db routes to the installed drop-db.sh with the schema argument" {
  # The installed path only exists on the server, so on a CI runner exec fails.
  # What matters here is that the router reached for that exact path and did
  # not report an unknown command.
  [ ! -e /opt/platform/brockcsc/drop-db.sh ] || skip "running on a host with the real script installed"
  SSH_ORIGINAL_COMMAND="drop-db preview_x" run -127 sh "$REPO_ROOT/deploy/ssh-dispatch.sh"
  [ "$status" -eq 127 ]
  [[ "$output" != *"unknown command"* ]]
  [[ "$output" == *"/opt/platform/brockcsc/drop-db.sh"* ]]
}

@test "ssh-dispatch: a command that only starts with drop-db is not routed" {
  SSH_ORIGINAL_COMMAND="drop-dbx preview_x" run sh "$REPO_ROOT/deploy/ssh-dispatch.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown command"* ]]
}
