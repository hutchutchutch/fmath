import { UserManagerSettings } from 'oidc-client-ts';

// SSO Configuration for Cognito - Timeback Integration
export const ssoConfig: UserManagerSettings = {
    authority: process.env.REACT_APP_SSO_AUTHORITY || '',
    client_id: process.env.REACT_APP_SSO_CLIENT_ID || '',
    redirect_uri: `${window.location.origin}/auth/callback/cognito`,
    response_type: 'code',
    scope: 'email openid phone', // Timeback's recommended scope
    automaticSilentRenew: false,
    post_logout_redirect_uri: `${window.location.origin}/login`,
    // Client secret provided because the Cognito app client is confidential
    client_secret: process.env.REACT_APP_SSO_CLIENT_SECRET || undefined,
    // Use HTTP Basic authentication at the token endpoint (Cognito default)
    client_authentication: 'client_secret_basic',
    // Provide explicit metadata so oidc-client-ts doesn't try to fetch /.well-known/openid-configuration
    // (Timeback's custom Cognito domain does not host that file).
    metadata: process.env.REACT_APP_SSO_AUTHORITY ? {
        issuer: process.env.REACT_APP_SSO_AUTHORITY,
        authorization_endpoint: `${process.env.REACT_APP_SSO_AUTHORITY}/oauth2/authorize`,
        token_endpoint: `${process.env.REACT_APP_SSO_AUTHORITY}/oauth2/token`,
        userinfo_endpoint: `${process.env.REACT_APP_SSO_AUTHORITY}/oauth2/userinfo`,
        end_session_endpoint: `${process.env.REACT_APP_SSO_AUTHORITY}/logout`,
        jwks_uri: `${process.env.REACT_APP_SSO_AUTHORITY}/.well-known/jwks.json`,
    } : undefined,
};

// Check if SSO is configured
export const isSSOConfigured = (): boolean => {
    return !!(process.env.REACT_APP_SSO_CLIENT_ID && process.env.REACT_APP_SSO_AUTHORITY);
};

// Get the SSO login URL
export const getSSOLoginUrl = (): string => {
    if (!isSSOConfigured()) {
        throw new Error('SSO is not configured');
    }
    
    const authority = process.env.REACT_APP_SSO_AUTHORITY;
    const clientId = process.env.REACT_APP_SSO_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/callback/cognito`;
    
    return `${authority}/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid+email+profile`;
}; 