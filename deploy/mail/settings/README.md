# Stalwart settings

Stalwart 0.16 keeps almost all of its configuration in its database, not in a
file. This folder is a copy of that configuration, so changes can be reviewed
in a pull request and the server can be rebuilt from it.

One file per setting type. Each file looks like this:

    { "type": "Domain", "singleton": false, "objects": [ { "id": "...", ... } ] }

Types with `"singleton": true` have exactly one object, id `singleton`. The
rest are lists. Keys are sorted so diffs stay small.

## What is not here

- Accounts, API keys and public keys (users and credentials).
- The bulk default lookup lists (`MemoryLookupKey`).
- `MtaHook`, which the server refused to return on export.

## Placeholders

Nothing secret is stored. These values are replaced on export:

| Placeholder | Meaning |
| --- | --- |
| `<SECRET>` | A private key or password. Stalwart already masks these as `****`. |
| `<PEM>` | A certificate body. The cert is renewed by `refresh-cert.sh`. |
| `<AUTH_USERNAME>` | The SMTP relay login. |
| `<MEMBERS_NOT_EXPORTED>` | Mailing list recipients. |

Public DKIM keys are kept. They are published in DNS anyway.

## Export

Run on the mail host (needs docker and jq). It only sends read requests.

    sh deploy/mail/export-settings.sh

Files are written read-only. Running it again replaces them.
Then `git diff deploy/mail/settings` shows what changed on the server since the
last export. Commit the diff if the change was meant.

## Review

- Check the diff for anything that looks like a key or password. The script
  strips them, but look anyway.
- Each file is plain JSON. Field names match the `x:` objects in the Stalwart
  JMAP API (for example `x:Domain`).

## Apply

Applying is manual and not done by any script here. Do it only after review.

1. Pick the file, for example `SpamSettings.json`.
2. Remove any field that still holds a placeholder. Never send `<SECRET>`.
3. Build a `set` request and send it with the admin login, the same way
   `refresh-cert.sh` does:

        jq '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
             methodCalls:[["x:" + .type + "/set",
               {update: (.objects | map({(.id): del(.id)}) | add)}, "c0"]]}' \
          SpamSettings.json > /tmp/set.json

   Send `/tmp/set.json` to `$STALWART_URL/jmap`. Check `updated` in the reply.
4. Export again and confirm the diff is empty.

Objects that do not exist yet go in `create` instead of `update`.

## Roll back

Check out the previous version of the file from git and apply it the same way.
A pre-change export is the restore point, so run the export before you apply.
