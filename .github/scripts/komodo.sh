# Shared helpers for talking to the Komodo API from CI. Source this - it
# relies on KOMODO_HOST/KOMODO_API_KEY/KOMODO_API_SECRET already being
# exported by the calling step, and needs jq + curl on PATH.

# POST $1=path $2=json body. Prints the response body on success. On HTTP
# >= 400, prints the real status + response body via ::error:: and returns
# non-zero, instead of curl -sf's bare, contextless exit code.
komodo() {
  local path="$1" body="$2" resp status
  resp="$(mktemp)"
  status=$(curl -s -o "$resp" -w '%{http_code}' -X POST "$KOMODO_HOST$path" \
    -H "Content-Type: application/json" -H "x-api-key: $KOMODO_API_KEY" -H "x-api-secret: $KOMODO_API_SECRET" \
    -d "$body")
  if [ "$status" -ge 400 ]; then
    echo "::error::POST $path -> HTTP $status: $(cat "$resp")"
    rm -f "$resp"
    return 1
  fi
  cat "$resp"
  rm -f "$resp"
}

# Execute-type calls (RunSync, RunAction, RunBuild, ...) return immediately
# with status "InProgress" - the real work happens async. Poll GetUpdate on
# the returned update id until it finishes before trusting its effects.
#   $1 = the JSON body returned by the triggering `komodo /execute ...` call
#   $2 = max poll attempts, one every 5s (default 24 = 2 minutes)
komodo_await() {
  local update_json="$1" max_attempts="${2:-24}" id attempt=0 poll
  id=$(echo "$update_json" | jq -r '._id["$oid"] // empty')
  if [ -z "$id" ]; then
    echo "::error::No update id in execute response: $update_json"
    return 1
  fi
  while [ "$attempt" -lt "$max_attempts" ]; do
    sleep 5
    attempt=$((attempt + 1))
    poll="$(komodo /read "$(jq -n --arg id "$id" '{type:"GetUpdate", params:{id:$id}}')")" || return 1
    if [ "$(echo "$poll" | jq -r '.status')" = "Complete" ]; then
      if [ "$(echo "$poll" | jq -r '.success')" != "true" ]; then
        echo "::error::Komodo operation $id finished but failed: $poll"
        return 1
      fi
      echo "$poll"
      return 0
    fi
  done
  echo "::error::Komodo operation $id did not finish within $((max_attempts * 5))s"
  return 1
}
