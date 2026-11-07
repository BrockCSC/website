#!/bin/sh
# Removes everything a closed branch preview leaves on the server: containers,
# docker volumes, the git checkout Komodo made, and the database schema.
#
# Takes the branch slug (what deploy-context.mjs and cleanup.yml compute) and
# derives every name from it. Nothing else is accepted, so a bad argument
# cannot reach prod, uat, mail or another preview:
#   stack    brockcsc-pr-<slug>
#   checkout $STACKS_DIR/brockcsc-pr-<slug>
#   volumes  only those compose labelled with project brockcsc-pr-<slug>
#   schema   preview_<slug with - as _>
set -eu

STACKS_DIR="${STACKS_DIR:-/etc/komodo/stacks}"
HERE="$(cd "$(dirname "$0")" && pwd)"

SLUG="${1:?usage: cleanup-preview.sh <branch-slug>}"

# Same shape slugify() in komodo/deploy-context.mjs produces: lowercase
# letters, digits and single dashes, at most 40 characters. A trailing dash
# is possible when the 40-character cut lands on one.
if [ "${#SLUG}" -gt 40 ] || ! printf '%s' "$SLUG" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*-?$'; then
  echo "refusing: '$SLUG' is not a valid preview slug" >&2
  exit 1
fi
case "$SLUG" in
  main)
    echo "refusing: main is not a preview" >&2
    exit 1
    ;;
esac

STACK="brockcsc-pr-$SLUG"
SCHEMA="preview_$(printf '%s' "$SLUG" | tr '-' '_')"
CHECKOUT="$STACKS_DIR/$STACK"

echo "preview $SLUG -> stack $STACK, schema $SCHEMA"

# 1. containers that still belong to this exact compose project
containers=$(sudo docker ps -aq --filter "label=com.docker.compose.project=$STACK")
if [ -n "$containers" ]; then
  # shellcheck disable=SC2086 # ids are hex, one per line
  sudo docker rm -f $containers >/dev/null
  echo "removed containers"
fi

# 2. volumes of this exact compose project
volumes=$(sudo docker volume ls -q --filter "label=com.docker.compose.project=$STACK")
for v in $volumes; do
  case "$v" in
    "$STACK"-*) sudo docker volume rm "$v" >/dev/null && echo "removed volume $v" ;;
    *) echo "skipping volume $v (name does not start with $STACK-)" >&2 ;;
  esac
done

# 3. the checkout
if [ -d "$CHECKOUT" ]; then
  sudo rm -rf -- "$CHECKOUT"
  echo "removed $CHECKOUT"
fi

# 4. the schema (drop-db.sh repeats the preview_ and character checks)
"$HERE/drop-db.sh" "$SCHEMA"
echo "done"
