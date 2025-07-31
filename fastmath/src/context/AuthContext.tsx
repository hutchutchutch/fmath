import { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { validateToken } from '../config/api';
import * as Sentry from '@sentry/react';

interface User {
    email: string;
    userId: string;
    name?: string;
    currentTrack?: string;
    currentStage?: string;
    ageGrade?: number;
    focusTrack?: string;
    campus?: string;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    token: string | null;
    login: (token: string, userData?: Partial<User>) => void;
    logout: () => void;
    isAuthenticated: boolean;
    processToken: (token: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Initialize auth only from localStorage
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const storedToken = localStorage.getItem('token');
                if (storedToken) {
                    const isValid = await processToken(storedToken);
                    if (!isValid) {
                        localStorage.removeItem('token');
                        setUser(null);
                        setToken(null);
                    }
                }
            } catch (error) {
                console.error('Auth initialization error:', error);
            } finally {
                setLoading(false);
            }
        };

        initializeAuth();
    }, []);

    // This is now only used for validating tokens from URL or localStorage
    const processToken = async (token: string) => {
        try {
            console.log('[Auth] Starting token validation');
            const startTime = Date.now();
            const decoded = jwtDecode<{ email: string; userId: string }>(token);
            const expirationTime = (decoded as any).exp * 1000;
            if (expirationTime < Date.now()) {
                console.log('[Auth] Token expired, clearing user', { userId: decoded.userId, expirationTime });
                return false;
            }
            if (!decoded.email || !decoded.userId) {
                console.log('[Auth] Invalid token format: missing email or userId', { decoded });
                throw new Error('Invalid token format');
            }
            console.log(`[Auth] Validating token for user ${decoded.userId}, decoded successfully`);
            const validation = await validateToken(token);
            console.log(`[Auth] Token validation completed in ${Date.now() - startTime}ms, valid: ${validation.valid}`);
            if (!validation.valid || !validation.user) {
                console.log('[Auth] Token validation failed from API, clearing user', { userId: decoded.userId });
                return false;
            }
            const userData = {
                ...validation.user,
                email: decoded.email,
                userId: decoded.userId
            };
            localStorage.setItem('token', token);
            setToken(token);
            setUser(userData);
            Sentry.setUser({
                id: userData.userId,
                email: userData.email
            });
            console.log('[Auth] Token valid, user set', { userId: userData.userId });
            return true;
        } catch (error) {
            console.error(`[Auth] Token validation failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.log('[Auth] Clearing user due to token validation error');
            localStorage.removeItem('token');
            setToken(null);
            setUser(null);
            Sentry.setUser(null);
            return false;
        }
    };

    // Simplified login that doesn't need validation
    const login = (newToken: string, userData?: Partial<User>) => {
        try {
            const decoded = jwtDecode<{ email: string; userId: string }>(newToken);
            if (!decoded.email || !decoded.userId) {
                throw new Error('Invalid token format');
            }
            const newUser = {
                email: decoded.email,
                userId: decoded.userId,
                ...userData
            };
            localStorage.setItem('token', newToken);
            setToken(newToken);
            setUser(newUser);
            Sentry.setUser({
                id: newUser.userId,
                email: newUser.email
            });
            console.log('[Auth] Login successful, user set', { userId: newUser.userId });
        } catch (error) {
            console.log('[Auth] Login failed, calling logout');
            logout();
            throw error;
        }
    };

    const logout = () => {
        console.log('[Auth] Logout called, clearing user');
        localStorage.removeItem('token');
        localStorage.removeItem('activeTrackId');
        setToken(null);
        setUser(null);
        Sentry.setUser(null);
    };

    const contextValue = {
        user,
        loading,
        token,
        login,
        logout,
        isAuthenticated: !!user,
        processToken,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
