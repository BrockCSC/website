<?php
// Keycloak OIDC. Stalwart accepts the resulting token over IMAP/SMTP via
// OAUTHBEARER, so execs never hold a separate mail password.
$issuer = getenv('KEYCLOAK_ISSUER');

$config['oauth_provider'] = 'generic';
$config['oauth_provider_name'] = 'BrockCSC';
$config['oauth_client_id'] = getenv('ROUNDCUBE_OAUTH_CLIENT_ID');
$config['oauth_client_secret'] = getenv('ROUNDCUBE_OAUTH_CLIENT_SECRET');
$config['oauth_auth_uri'] = $issuer . '/protocol/openid-connect/auth';
$config['oauth_token_uri'] = $issuer . '/protocol/openid-connect/token';
$config['oauth_identity_uri'] = $issuer . '/protocol/openid-connect/userinfo';
$config['oauth_scope'] = 'openid email profile';
$config['oauth_identity_fields'] = ['email'];
$config['oauth_login_redirect'] = true;
