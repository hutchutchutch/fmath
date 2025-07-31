export interface CognitoConfig {
    region: string;
    userPoolId: string;
    clientId: string;
    issuer: string;
    jwksUri: string;
}

// Environment-based Cognito configuration
export const cognitoConfig: CognitoConfig = {
    region: process.env.COGNITO_REGION || 'us-east-1',
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    clientId: process.env.COGNITO_CLIENT_ID || '',
    issuer: process.env.COGNITO_ISSUER || `https://cognito-idp.${process.env.COGNITO_REGION || 'us-east-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID || ''}`,
    jwksUri: process.env.COGNITO_JWKS_URI || `https://cognito-idp.${process.env.COGNITO_REGION || 'us-east-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID || ''}/.well-known/jwks.json`
};

// Validate configuration
export const validateCognitoConfig = (): void => {
    const requiredEnvVars = ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.warn(`Missing Cognito environment variables: ${missingVars.join(', ')}`);
        console.warn('SSO functionality will be disabled');
    }
};

// Check if SSO is properly configured
export const isSSOConfigured = (): boolean => {
    return !!(process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID);
}; 