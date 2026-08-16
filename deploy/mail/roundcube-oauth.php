<?php
$issuer = getenv('KEYCLOAK_ISSUER');

// Traefik terminates TLS; without this the redirect_uri is built as http://.
$config['proxy_whitelist'] = ['172.18.0.0/16'];

$config['oauth_provider'] = 'generic';
$config['oauth_provider_name'] = 'BrockCSC';
$config['oauth_client_id'] = getenv('ROUNDCUBE_OAUTH_CLIENT_ID');
$config['oauth_client_secret'] = getenv('ROUNDCUBE_OAUTH_CLIENT_SECRET');
$config['oauth_issuer'] = $issuer;
$config['oauth_config_uri'] = $issuer . '/.well-known/openid-configuration';
$config['oauth_scope'] = 'openid email profile';
// preferred_username is the mailbox local-part; the email claim is the
// member's personal address and would become their From line.
$config['oauth_identity_fields'] = ['preferred_username'];
// Keeps the password form alongside the SSO button.
$config['oauth_login_redirect'] = false;
$config['oauth_pkce'] = 'S256';

// Stalwart only serves implicit TLS (993/465) and its cert is self-signed
// until ACME lands. This hop never leaves wayfarer-net.
$ssl = ['ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true]];
$config['imap_conn_options'] = $ssl;
$config['smtp_conn_options'] = $ssl;

$config['product_name'] = 'BrockCSC Mail';
// Relative values get the parent skin's path prepended, so this must be absolute.
$logo = 'https://mail.brockcsc.ca/static.php/skins/brockcsc/images/logo.svg';
$config['skin_logo'] = ['*' => $logo, '*[favicon]' => $logo];
$config['support_url'] = 'https://brockcsc.ca';
$config['username_domain'] = 'brockcsc.ca';
$config['mail_domain'] = 'brockcsc.ca';
