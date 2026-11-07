#!/usr/bin/env bash
# Passes only when the mail server answers the IMAPS greeting several times in a row.
set -u
host=${MAIL_HOST:-mail.brockcsc.ca}
need=${NEED_IN_A_ROW:-6}
tries=${MAX_TRIES:-30}
ok=0
for i in $(seq 1 "$tries"); do
  banner=$(printf 'a1 LOGOUT\r\n' | timeout 8 openssl s_client -connect "$host:993" -quiet 2>/dev/null | head -n 1 | tr -d '\r')
  if [[ "$banner" == "* OK"* ]]; then ok=$((ok + 1)); else ok=0; fi
  echo "check $i: greeting ok $ok in a row"
  if [ "$ok" -ge "$need" ]; then echo "mail is healthy"; exit 0; fi
  sleep "${SLEEP:-10}"
done
echo "mail did not stay healthy after the deploy" >&2
exit 1
