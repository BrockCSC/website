#!/bin/sh
set -eu

ACME_JSON="${ACME_JSON:-/var/lib/docker/volumes/wayfarer_traefik-acme/_data/acme-dns.json}"
ACME_RESOLVER="${ACME_RESOLVER:-le-dns}"
CERT_DOMAIN="${CERT_DOMAIN:-*.brockcsc.ca}"
CONTAINER="${STALWART_CONTAINER:-brockcsc-stalwart}"
STALWART_URL="${STALWART_URL:-http://brockcsc-stalwart:8080}"
NETWORK="${DOCKER_NETWORK:-wayfarer-net}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

jq -r --arg r "$ACME_RESOLVER" --arg d "$CERT_DOMAIN" \
  '.[$r].Certificates[] | select(.domain.main == $d) | .certificate' \
  "$ACME_JSON" | base64 -d > "$work/cert.pem"
jq -r --arg r "$ACME_RESOLVER" --arg d "$CERT_DOMAIN" \
  '.[$r].Certificates[] | select(.domain.main == $d) | .key' \
  "$ACME_JSON" | base64 -d > "$work/key.pem"

[ -s "$work/cert.pem" ] && [ -s "$work/key.pem" ] || {
  echo "no certificate for $CERT_DOMAIN in $ACME_JSON" >&2
  exit 1
}

expires=$(openssl x509 -in "$work/cert.pem" -noout -enddate | cut -d= -f2)
expires=$(date -u -d "$expires" +%Y-%m-%dT%H:%M:%SZ)

admin=$(docker exec "$CONTAINER" printenv STALWART_RECOVERY_ADMIN)

jmap() {
  docker run --rm --network "$NETWORK" -v "$1:/payload.json:ro" \
    curlimages/curl:latest -s -u "$admin" \
    -H "content-type: application/json" \
    --data-binary @/payload.json "$STALWART_URL/jmap"
}

jq -n '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
        methodCalls:[["x:Certificate/get",{},"c0"]]}' > "$work/get.json"
current=$(jmap "$work/get.json")

installed=$(echo "$current" | jq -r --arg d "$CERT_DOMAIN" \
  '[.methodResponses[0][1].list[] | select(.subjectAlternativeNames | has($d))][0] // empty')

if [ -n "$installed" ] &&
   [ "$(echo "$installed" | jq -r .notValidAfter)" = "$expires" ]; then
  echo "up to date, expires $expires"
  exit 0
fi

id=$(echo "$installed" | jq -r '.id // empty')
if [ -n "$id" ]; then
  jq -n --rawfile cert "$work/cert.pem" --rawfile key "$work/key.pem" --arg id "$id" \
    '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
      methodCalls:[["x:Certificate/set",{update:{($id):{
        certificate:{"@type":"Text",value:$cert},
        privateKey:{"@type":"Text",secret:$key}}}},"c0"]]}' > "$work/set.json"
else
  jq -n --rawfile cert "$work/cert.pem" --rawfile key "$work/key.pem" \
    '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
      methodCalls:[["x:Certificate/set",{create:{new:{
        certificate:{"@type":"Text",value:$cert},
        privateKey:{"@type":"Text",secret:$key}}}},"c0"]]}' > "$work/set.json"
fi

result=$(jmap "$work/set.json")
echo "$result" | jq -e '.methodResponses[0][1] | (.created // .updated)' >/dev/null || {
  echo "stalwart rejected the certificate: $result" >&2
  exit 1
}

docker restart "$CONTAINER" >/dev/null
echo "installed certificate expiring $expires and restarted $CONTAINER"
