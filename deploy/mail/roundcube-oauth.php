<?php
// Keycloak OIDC. Stalwart accepts the resulting token over IMAP/SMTP via
// OAUTHBEARER, so execs never hold a separate mail password.
$issuer = getenv('KEYCLOAK_ISSUER');

// Traefik terminates TLS, so without trusting its X-Forwarded-Proto Roundcube
// builds an http:// redirect_uri and Keycloak rejects it.
$config['proxy_whitelist'] = ['172.18.0.0/16'];

$config['oauth_provider'] = 'generic';
$config['oauth_provider_name'] = 'BrockCSC';
$config['oauth_client_id'] = getenv('ROUNDCUBE_OAUTH_CLIENT_ID');
$config['oauth_client_secret'] = getenv('ROUNDCUBE_OAUTH_CLIENT_SECRET');
$config['oauth_issuer'] = $issuer;
$config['oauth_config_uri'] = $issuer . '/.well-known/openid-configuration';
$config['oauth_scope'] = 'openid email profile';
$config['oauth_identity_fields'] = ['email'];
// false keeps the password form alongside the SSO button, so app passwords
// still work in webmail and a Keycloak outage does not lock everyone out.
$config['oauth_login_redirect'] = false;
$config['oauth_pkce'] = 'S256';
