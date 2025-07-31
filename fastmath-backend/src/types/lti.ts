export interface LTILaunchRequest {
  messageType: string;           // Should be "LtiResourceLinkRequest"
  iss: string;                   // Should be "https://studyreel.alpha1edtech.com"
  deployment_id: string;         // Should match our deployment key
  role: string;                  // Should be "Student"
  sub: string;                   // User's email
  iat: number;                   // Issued at time
  exp: number;                   // Expiration time
  nonce: string;                 // Nonce
  jti: string;                   // JWT ID
}

export interface LTILaunchResponse {
  status: "success";
  message: string;
  userID: string;
  userType: "new" | "existing";
  loginLink: string;
}