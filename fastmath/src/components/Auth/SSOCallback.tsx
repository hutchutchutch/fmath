import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSSOAuth } from '../../providers/SSOProvider';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../config/api';
import { motion } from 'framer-motion';
import Logo from '../common/Logo';

export const SSOCallback: React.FC = () => {
    const navigate = useNavigate();
    const { userManager } = useSSOAuth();
    const { login } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(true);

    useEffect(() => {
        // Wait until the UserManager instance has been initialised
        if (!userManager) {
            return;
        }

        const handleCallback = async () => {
            try {
                // Complete the signin process
                const user = await userManager.signinRedirectCallback();

                if (!user || !user.id_token) {
                    throw new Error('No valid token received from SSO provider');
                }

                // Exchange the Cognito token for a FastMath token
                const response = await api.post('/auth/sso-login', {
                    id_token: user.id_token
                });

                if (!response.data || !response.data.token) {
                    throw new Error('Invalid response from server');
                }

                // Use the FastMath token to log in
                await login(response.data.token, response.data.user);

                // Redirect to dashboard
                navigate('/');

            } catch (err) {
                console.error('SSO callback error:', err);

                let errorMessage = 'SSO login failed';

                if (err instanceof Error) {
                    if (err.message.includes('No FastMath account found')) {
                        errorMessage = 'No FastMath account found for this email. Please sign up first.';
                    } else if (err.message.includes('Token expired')) {
                        errorMessage = 'Login session expired. Please try again.';
                    } else if (err.message.includes('Invalid token')) {
                        errorMessage = 'Invalid login token. Please try again.';
                    } else if (err.message.includes('Email not verified')) {
                        errorMessage = 'Email not verified. Please verify your email with Timeback first.';
                    }
                }

                setError(errorMessage);
                setIsProcessing(false);

                // Redirect to login page after 3 seconds
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
            }
        };

        handleCallback();
    }, [userManager, login, navigate]);

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center items-center p-6">
                <div className="max-w-md mx-auto text-center space-y-6">
                    <div className="flex items-center justify-center gap-4 mb-8">
                        <Logo size={32} />
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                            Fast Math
                        </h1>
                    </div>
                    
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-lg shadow-md p-6 space-y-4"
                    >
                        <div className="text-red-500 text-xl">⚠️</div>
                        <h2 className="text-xl font-semibold text-gray-800">SSO Login Failed</h2>
                        <p className="text-gray-600">{error}</p>
                        <p className="text-sm text-gray-500">
                            Redirecting to login page in a few seconds...
                        </p>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center items-center p-6">
            <div className="max-w-md mx-auto text-center space-y-6">
                <div className="flex items-center justify-center gap-4 mb-8">
                    <Logo size={32} />
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                        Fast Math
                    </h1>
                </div>
                
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg shadow-md p-6 space-y-4"
                >
                    {isProcessing ? (
                        <>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"
                            />
                            <h2 className="text-xl font-semibold text-gray-800">Completing SSO Login</h2>
                            <p className="text-gray-600">Please wait while we verify your credentials...</p>
                        </>
                    ) : (
                        <>
                            <div className="text-green-500 text-xl">✅</div>
                            <h2 className="text-xl font-semibold text-gray-800">Login Successful</h2>
                            <p className="text-gray-600">Redirecting to your dashboard...</p>
                        </>
                    )}
                </motion.div>
            </div>
        </div>
    );
}; 