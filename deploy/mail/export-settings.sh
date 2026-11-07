#!/bin/sh
# Export the non-secret Stalwart settings to deploy/mail/settings/ as JSON.
#
# Read-only against the server: it only sends JMAP "get" calls. Run it on the
# mail host (needs docker and jq), then review the diff and commit.
#
#   sh deploy/mail/export-settings.sh [output-dir]
#
# Secrets never reach disk. Stalwart already masks private keys as "****";
# this script also replaces every secret, key, PEM block, relay username and
# mailing-list member with a placeholder. See settings/README.md.
set -eu

CONTAINER="${STALWART_CONTAINER:-brockcsc-stalwart}"
STALWART_URL="${STALWART_URL:-http://brockcsc-stalwart:8080}"
NETWORK="${DOCKER_NETWORK:-platform-net}"
OUT="${1:-$(cd "$(dirname "$0")" && pwd)/settings}"

# Settings that exist exactly once (id "singleton").
SINGLETONS="SystemSettings Authentication Security Http HttpForm Imap Jmap Email
Calendar Cache Search DataStore BlobStore InMemoryStore SearchStore Coordinator
TaskManager DnsResolver Metrics MetricsStore Asn Enterprise SenderAuth MtaSts
MtaExtensions MtaOutboundStrategy MtaStageConnect MtaStageEhlo MtaStageAuth
MtaStageMail MtaStageRcpt MtaStageData SieveSystemInterpreter
SieveUserInterpreter SpamSettings SpamClassifier SpamLlm SpamDnsblSettings"

# Settings that hold a list of objects.
COLLECTIONS="Domain DkimSignature NetworkListener Directory Certificate Role
MailingList AllowedIp BlockedIp Tracer MtaRoute MtaConnectionStrategy
MtaTlsStrategy MtaVirtualQueue MtaQueueQuota MtaInboundThrottle
MtaOutboundThrottle MtaDeliverySchedule MtaHook MtaMilter SieveSystemScript
SieveUserScript SpamTag SpamFileExtension SpamDnsblServer SpamRule Application
OAuthClient AcmeProvider"

# Left out on purpose: Account, ApiKey, PublicKey (users and credentials) and
# MemoryLookupKey/Value (bulk default lookup lists).

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
admin=$(docker exec "$CONTAINER" printenv STALWART_RECOVERY_ADMIN)

jmap() {
  docker run --rm --network "$NETWORK" -v "$1:/payload.json:ro" \
    curlimages/curl:latest -s -u "$admin" \
    -H "content-type: application/json" \
    --data-binary @/payload.json "$STALWART_URL/jmap"
}

# Replace secrets and personal data with placeholders. Keys are sorted so the
# output diffs cleanly between exports.
SANITIZE='
def clean:
  walk(
    if type == "object" then
      with_entries(
        if .key == "secret" and (.value | type) == "string" then .value = "<SECRET>"
        elif (.key | test("^(password|authSecret|privateKey|apiKey|licenseKey)$"; "i"))
             and (.value | type) == "string" then .value = "<SECRET>"
        elif .key == "authUsername" and .value != null then .value = "<AUTH_USERNAME>"
        elif .key == "recipients" and .value != null then .value = "<MEMBERS_NOT_EXPORTED>"
        elif .key == "dnsZoneFile" or .key == "createdAt" then empty
        else . end)
    elif type == "string" and test("-----BEGIN") then "<PEM>"
    else . end);
'

mkdir -p "$OUT"
# Make files from a previous run writable so they can be replaced.
chmod -R u+w "$OUT" 2>/dev/null || true
rm -f "$OUT"/*.json

fetch() { # kind type...
  kind=$1; shift
  for t in "$@"; do
    if [ "$kind" = single ]; then ids='["singleton"]'; else ids=null; fi
    jq -n --arg t "$t" --argjson ids "$ids" \
      '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
        methodCalls:[["x:"+$t+"/get",{ids:$ids},$t]]}' > "$work/req.json"
    jmap "$work/req.json" > "$work/res.json"
    if ! jq -e '.methodResponses[0][0] | endswith("/get")' "$work/res.json" >/dev/null 2>&1; then
      echo "skipped $t: $(jq -c '.methodResponses[0][1].type // .' "$work/res.json" 2>/dev/null | head -c 120)" >&2
      continue
    fi
    jq -S --arg t "$t" --arg kind "$kind" "$SANITIZE"'
      .methodResponses[0][1].list
      | map(clean) | sort_by(.id)
      | {type: $t, singleton: ($kind == "single"), objects: .}' \
      "$work/res.json" > "$work/$t.json"
    n=$(jq '.objects | length' "$work/$t.json")
    if [ "$kind" = coll ] && [ "$n" -eq 0 ]; then continue; fi
    mv "$work/$t.json" "$OUT/$t.json"
    echo "$t: $n"
  done
}

# shellcheck disable=SC2086
fetch single $SINGLETONS
# shellcheck disable=SC2086
fetch coll $COLLECTIONS

chmod 444 "$OUT"/*.json
echo "wrote $(ls "$OUT"/*.json | wc -l) files to $OUT (read-only)"
