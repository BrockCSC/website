## Runs on every inbound message at Stalwart's DATA stage (all accounts, every
## protocol), so the warning shows in any mail client - not just the site's
## own webmail. Installed by install-external-banner.sh; edit that script's
## DOMAINS list, not this file, if the club's mail domain ever changes.

require ["editheader", "variables", "mime", "foreverypart", "extracttext",
         "replace"];

if not address :domain :is "from" ["brockcsc.ca"] {
    addheader :last "X-BrockCSC-External" "yes";

    foreverypart {
        if header :mime :contenttype :is "Content-Type" "text/plain" {
            extracttext :first 200000 "part";
            replace "*** EXTERNAL SENDER: this message came from outside BrockCSC. Be careful with links, attachments and requests for information. ***\r\n\r\n${part}";
        }
        if header :mime :contenttype :is "Content-Type" "text/html" {
            extracttext :first 200000 "part";
            replace "<div style=\"border:2px solid #b3261e;background:#fdecea;color:#611a15;padding:10px 14px;margin:0 0 12px 0;font-family:sans-serif;font-size:14px;\">&#9888;&nbsp;<strong>External sender</strong> &mdash; this message came from outside BrockCSC. Be careful with links, attachments and requests for information.</div>${part}";
        }
    }
}
