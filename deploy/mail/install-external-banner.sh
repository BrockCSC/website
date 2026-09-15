#!/bin/sh
set -eu

# Installs external-sender-banner.sieve as Stalwart's DATA-stage system
# script, so every account - read through the site's webmail, Thunderbird,
# Outlook, a phone's mail app, anything - sees the same warning on mail from
# outside the club's domain. Idempotent, so run it again any time the .sieve
# file changes. Install it on the VPS beside refresh-cert.sh; nothing runs it
# automatically from this repo.

DOMAINS="${EXTERNAL_BANNER_DOMAINS:-brockcsc.ca}"
SCRIPT_NAME="${SCRIPT_NAME:-external-sender-banner}"
SIEVE_FILE="$(dirname "$0")/external-sender-banner.sieve"
CONTAINER="${STALWART_CONTAINER:-brockcsc-stalwart}"
STALWART_URL="${STALWART_URL:-http://brockcsc-stalwart:8080}"
NETWORK="${DOCKER_NETWORK:-wayfarer-net}"

[ -f "$SIEVE_FILE" ] || {
  echo "missing $SIEVE_FILE" >&2
  exit 1
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

domains_json=$(printf '%s\n' "$DOMAINS" | tr ',' '\n' | jq -R . | jq -s .)
sed "s/\\[\"brockcsc\\.ca\"\\]/$(echo "$domains_json" | jq -c .)/" "$SIEVE_FILE" > "$work/script.sieve"

admin=$(docker exec "$CONTAINER" printenv STALWART_RECOVERY_ADMIN)

jmap() {
  docker run --rm --network "$NETWORK" -v "$1:/payload.json:ro" \
    curlimages/curl:latest -s -u "$admin" \
    -H "content-type: application/json" \
    --data-binary @/payload.json "$STALWART_URL/jmap"
}

jq -n '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
        methodCalls:[["x:SieveSystemScript/get",{},"c0"],
                     ["x:MtaStageData/get",{"ids":["singleton"]},"c1"]]}' \
  > "$work/get.json"
current=$(jmap "$work/get.json")

existing_id=$(echo "$current" | jq -r --arg n "$SCRIPT_NAME" \
  '.methodResponses[0][1].list[] | select(.name == $n) | .id' | head -n1)
existing_contents=$(echo "$current" | jq -r --arg n "$SCRIPT_NAME" \
  '.methodResponses[0][1].list[] | select(.name == $n) | .contents // empty' | head -n1)
active_script=$(echo "$current" | jq -r '.methodResponses[1][1].script.else // empty')

wanted_contents=$(cat "$work/script.sieve")

if [ -n "$existing_id" ] && [ "$existing_contents" = "$wanted_contents" ] &&
   [ "$active_script" = "$existing_id" ]; then
  echo "up to date: $SCRIPT_NAME ($existing_id) already active at the DATA stage"
  exit 0
fi

if [ -n "$active_script" ] && [ "$active_script" != "$existing_id" ]; then
  echo "warning: MtaStageData.script is currently \"$active_script\", not $SCRIPT_NAME - overwriting it" >&2
fi

if [ -n "$existing_id" ]; then
  jq -n --rawfile contents "$work/script.sieve" --arg id "$existing_id" \
    '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
      methodCalls:[["x:SieveSystemScript/set",
        {update:{($id):{contents:$contents, isActive:true}}},"c0"]]}' \
    > "$work/set-script.json"
  script_id="$existing_id"
else
  jq -n --rawfile contents "$work/script.sieve" --arg name "$SCRIPT_NAME" \
    '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
      methodCalls:[["x:SieveSystemScript/set",
        {create:{new:{name:$name, contents:$contents, isActive:true}}},"c0"]]}' \
    > "$work/set-script.json"
fi

set_result=$(jmap "$work/set-script.json")
if [ -z "${script_id:-}" ]; then
  script_id=$(echo "$set_result" | jq -r '.methodResponses[0][1].created.new.id // empty')
fi
echo "$set_result" | jq -e '.methodResponses[0][1] | (.created // .updated)' >/dev/null || {
  echo "stalwart rejected the sieve script: $set_result" >&2
  exit 1
}
[ -n "$script_id" ] || {
  echo "could not determine the sieve script id: $set_result" >&2
  exit 1
}

jq -n --arg id "$script_id" \
  '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
    methodCalls:[["x:MtaStageData/set",
      {update:{singleton:{script:{"else":$id}}}},"c1"]]}' \
  > "$work/set-stage.json"

stage_result=$(jmap "$work/set-stage.json")
echo "$stage_result" | jq -e '.methodResponses[0][1].updated' >/dev/null || {
  echo "stalwart rejected the DATA-stage assignment: $stage_result" >&2
  exit 1
}

echo "installed $SCRIPT_NAME ($script_id) as the active DATA-stage script for: $DOMAINS"
