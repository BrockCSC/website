#!/usr/bin/env bats
# Tests for deploy/cleanup-preview.sh. sudo is a stub that records its
# arguments and prints canned docker listings, so nothing touches docker, the
# database or the real stacks folder.

bats_require_minimum_version 1.5.0

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  STUB_DIR="$BATS_TEST_TMPDIR/bin"
  SUDO_LOG="$BATS_TEST_TMPDIR/sudo.log"
  export STACKS_DIR="$BATS_TEST_TMPDIR/stacks"
  mkdir -p "$STUB_DIR" "$STACKS_DIR"
  cat > "$STUB_DIR/sudo" <<STUB
#!/bin/sh
echo "\$*" >> "$SUDO_LOG"
case "\$*" in
  "docker ps -aq"*) printf '%s' "\${FAKE_CONTAINERS:-}" ;;
  "docker volume ls"*) printf '%s' "\${FAKE_VOLUMES:-}" ;;
esac
exit 0
STUB
  chmod +x "$STUB_DIR/sudo"
  PATH="$STUB_DIR:$PATH"
}

@test "cleanup-preview: no argument prints usage and fails" {
  run sh "$REPO_ROOT/deploy/cleanup-preview.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"usage: cleanup-preview.sh"* ]]
}

@test "cleanup-preview: refuses anything that is not a branch slug" {
  for name in 'Feature' 'a_b' 'a b' 'a;b' 'a/b' '../x' '-x' '--x' '$(id)' 'preview x' 'a--b' '.'; do
    run sh "$REPO_ROOT/deploy/cleanup-preview.sh" "$name"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not a valid preview slug"* ]]
  done
  [ ! -e "$SUDO_LOG" ]
}

@test "cleanup-preview: refuses a slug longer than 40 characters" {
  run sh "$REPO_ROOT/deploy/cleanup-preview.sh" "$(printf 'a%.0s' $(seq 1 41))"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not a valid preview slug"* ]]
  [ ! -e "$SUDO_LOG" ]
}

@test "cleanup-preview: refuses main" {
  run sh "$REPO_ROOT/deploy/cleanup-preview.sh" main
  [ "$status" -eq 1 ]
  [[ "$output" == *"main is not a preview"* ]]
  [ ! -e "$SUDO_LOG" ]
}

@test "cleanup-preview: prod and uat stacks are never matched" {
  mkdir -p "$STACKS_DIR/brockcsc-prod" "$STACKS_DIR/brockcsc-uat"
  for name in prod uat; do
    run sh "$REPO_ROOT/deploy/cleanup-preview.sh" "$name"
    [ "$status" -eq 0 ]
    [[ "$output" == *"stack brockcsc-pr-$name"* ]]
  done
  ! grep -q 'brockcsc-prod\|brockcsc-uat' "$SUDO_LOG"
  [ -d "$STACKS_DIR/brockcsc-prod" ]
  [ -d "$STACKS_DIR/brockcsc-uat" ]
}

@test "cleanup-preview: derives checkout, volume filter and schema from the slug" {
  mkdir -p "$STACKS_DIR/brockcsc-pr-ala-63-fix"
  FAKE_VOLUMES="brockcsc-pr-ala-63-fix-documents" run sh "$REPO_ROOT/deploy/cleanup-preview.sh" ala-63-fix
  [ "$status" -eq 0 ]
  grep -qxF "docker ps -aq --filter label=com.docker.compose.project=brockcsc-pr-ala-63-fix" "$SUDO_LOG"
  grep -qxF "docker volume ls -q --filter label=com.docker.compose.project=brockcsc-pr-ala-63-fix" "$SUDO_LOG"
  grep -qxF "docker volume rm brockcsc-pr-ala-63-fix-documents" "$SUDO_LOG"
  grep -qxF "rm -rf -- $STACKS_DIR/brockcsc-pr-ala-63-fix" "$SUDO_LOG"
  grep -qF 'DROP SCHEMA IF EXISTS "preview_ala_63_fix" CASCADE' "$SUDO_LOG"
}

@test "cleanup-preview: removes containers of the project" {
  FAKE_CONTAINERS="abc123" run sh "$REPO_ROOT/deploy/cleanup-preview.sh" x1
  [ "$status" -eq 0 ]
  grep -qxF "docker rm -f abc123" "$SUDO_LOG"
}

@test "cleanup-preview: skips a volume whose name does not start with the stack name" {
  FAKE_VOLUMES="brockcsc-uploads" run sh "$REPO_ROOT/deploy/cleanup-preview.sh" x1
  [ "$status" -eq 0 ]
  [[ "$output" == *"skipping volume brockcsc-uploads"* ]]
  ! grep -q 'docker volume rm' "$SUDO_LOG"
}

@test "cleanup-preview: a missing checkout is not an error" {
  run sh "$REPO_ROOT/deploy/cleanup-preview.sh" gone
  [ "$status" -eq 0 ]
  ! grep -q '^rm -rf' "$SUDO_LOG"
}

@test "cleanup-preview: accepts a trailing dash left by the 40 character cut" {
  run sh "$REPO_ROOT/deploy/cleanup-preview.sh" abc-
  [ "$status" -eq 0 ]
  grep -qF '"preview_abc_"' "$SUDO_LOG"
}

@test "ssh-dispatch: cleanup-preview routes to the installed script" {
  [ ! -e /opt/platform/brockcsc/cleanup-preview.sh ] || skip "running on a host with the real script installed"
  SSH_ORIGINAL_COMMAND="cleanup-preview my-branch" run -127 sh "$REPO_ROOT/deploy/ssh-dispatch.sh"
  [ "$status" -eq 127 ]
  [[ "$output" != *"unknown command"* ]]
  [[ "$output" == *"/opt/platform/brockcsc/cleanup-preview.sh"* ]]
}
