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
$config['oauth_identity_fields'] = ['email'];
// Keeps the password form alongside the SSO button.
$config['oauth_login_redirect'] = false;
$config['oauth_pkce'] = 'S256';
