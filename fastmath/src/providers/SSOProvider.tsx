import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserManager, User } from 'oidc-client-ts';
import { ssoConfig, isSSOConfigured } from '../config/sso';

interface SSOContextType {
    userManager: UserManager | null;
    user: User | null;
    isLoading: boolean;
    error: string | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    isConfigured: boolean;
}

const SSOContext = createContext<SSOContextType | undefined>(undefined);

export const useSSOAuth = () => {
    const context = useContext(SSOContext);
    if (context === undefined) {
        throw new Error('useSSOAuth must be used within a SSOProvider');
    }
    return context;
};

interface SSOProviderProps {
    children: React.ReactNode;
}

export const SSOProvider: React.FC<SSOProviderProps> = ({ children }) => {
    const [userManager, setUserManager] = useState<UserManager | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const isConfigured = isSSOConfigured();

    useEffect(() => {
        if (!isConfigured) {
            setIsLoading(false);
            return;
        }

        try {
            const manager = new UserManager(ssoConfig);
            setUserManager(manager);

            // Set up event handlers
            manager.events.addUserLoaded((user) => {
                setUser(user);
                setError(null);
            });

            manager.events.addUserUnloaded(() => {
                setUser(null);
            });

            manager.events.addAccessTokenExpiring(() => {
                console.log('Access token expiring');
            });

            manager.events.addAccessTokenExpired(() => {
                console.log('Access token expired');
                setUser(null);
            });

            manager.events.addSilentRenewError((error) => {
                console.error('Silent renew error:', error);
                setError('Session renewal failed');
            });

            // Check for existing user
            manager.getUser().then((user) => {
                setUser(user);
                setIsLoading(false);
            }).catch((err) => {
                console.error('Error getting user:', err);
                setError('Failed to check authentication status');
                setIsLoading(false);
            });

        } catch (err) {
            console.error('Error initializing UserManager:', err);
            setError('Failed to initialize SSO');
            setIsLoading(false);
        }
    }, [isConfigured]);

    const login = async () => {
        if (!userManager) {
            throw new Error('UserManager not initialized');
        }
        
        try {
            setError(null);
            await userManager.signinRedirect();
        } catch (err) {
            console.error('Login error:', err);
            setError('Failed to initiate login');
            throw err;
        }
    };

    const logout = async () => {
        if (!userManager) {
            throw new Error('UserManager not initialized');
        }
        
        try {
            setError(null);
            await userManager.signoutRedirect();
        } catch (err) {
            console.error('Logout error:', err);
            setError('Failed to logout');
            throw err;
        }
    };

    const value: SSOContextType = {
        userManager,
        user,
        isLoading,
        error,
        login,
        logout,
        isAuthenticated: !!user && !user.expired,
        isConfigured
    };

    return (
        <SSOContext.Provider value={value}>
            {children}
        </SSOContext.Provider>
    );
}; 