import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSSOAuth } from '../../providers/SSOProvider';
import { api } from '../../config/api';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import axios from 'axios';
import { motion } from 'framer-motion';
import Logo from '../common/Logo';

export const LoginPage = () => {
    const { login } = useAuth();
    const { login: ssoLogin, isConfigured: isSSOConfigured } = useSSOAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSSOLoading, setIsSSOLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        
        try {
            console.log('Attempting login with:', { email });
            const response = await api.post('/auth/login', { email, password });
            console.log('Login response:', response);
            
            if (!response.data || !response.data.token) {
                throw new Error('Invalid response from server');
            }

            await login(response.data.token, response.data.user);
            navigate('/');
        } catch (err) {
            console.error('Login error:', err);
            if (axios.isAxiosError(err)) {
                if (err.code === 'ERR_NETWORK') {
                    setError('Unable to connect to server. Please check your connection.');
                } else {
                    setError(
                        err.response?.data?.message || 
                        err.response?.data?.details || 
                        'Network error occurred'
                    );
                }
            } else {
                setError(err instanceof Error ? err.message : 'Login failed');
            }
            localStorage.removeItem('token');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSSOLogin = async () => {
        if (!isSSOConfigured) {
            setError('SSO is not configured');
            return;
        }
        
        setIsSSOLoading(true);
        setError('');
        
        try {
            await ssoLogin();
        } catch (err) {
            console.error('SSO login error:', err);
            setError('Failed to initiate SSO login');
            setIsSSOLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
            <div className="max-w-4xl mx-auto space-y-8">
                <h1 className="text-4xl font-bold text-center mb-6 animate-fade-in flex items-center justify-center gap-4">
                    <Logo size={32} />
                    <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                        Fast Math
                    </span>
                </h1>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    <Card className="space-y-6 p-6 bg-white rounded-lg shadow-md">
                        <CardContent className="space-y-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                                className="text-center space-y-2"
                            >
                                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                                    Welcome Back
                                </h2>
                                <p className="text-base text-gray-600">Login to continue your math journey</p>
                            </motion.div>

                            <motion.form 
                                onSubmit={handleSubmit} 
                                className="space-y-6"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5, delay: 0.4 }}
                            >
                                {error && (
                                    <div className="p-4 rounded-lg bg-red-50 text-red-500 text-base text-center">
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label htmlFor="email" className="text-gray-700 font-medium text-base">
                                            Email
                                        </label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                                            placeholder="Enter your email"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label htmlFor="password" className="text-gray-700 font-medium text-base">
                                            Password
                                        </label>
                                        <Input
                                            id="password"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                                            placeholder="Enter your password"
                                            required
                                        />
                                    </div>
                                </div>

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.95 }}
                                    type="submit"
                                    disabled={isLoading}
                                    className={`w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 
                                        text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg 
                                        transition-all duration-300 flex items-center justify-center gap-2
                                        ${isLoading && 'opacity-50 cursor-not-allowed'}`}
                                >
                                    <span>{isLoading ? 'Logging in...' : 'Login'}</span>
                                </motion.button>

                                {isSSOConfigured && (
                                    <>
                                        <div className="relative">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-gray-200"></div>
                                            </div>
                                            <div className="relative flex justify-center text-sm">
                                                <span className="px-2 bg-white text-gray-500">or</span>
                                            </div>
                                        </div>

                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.95 }}
                                            type="button"
                                            onClick={handleSSOLogin}
                                            disabled={isSSOLoading}
                                            className={`w-full px-6 py-3 bg-white border-2 border-gray-300 
                                                text-gray-700 rounded-lg font-bold text-base shadow-md hover:shadow-lg 
                                                hover:border-blue-400 transition-all duration-300 flex items-center justify-center gap-2
                                                ${isSSOLoading && 'opacity-50 cursor-not-allowed'}`}
                                        >
                                            <span>{isSSOLoading ? 'Connecting...' : 'Sign in with Timeback SSO'}</span>
                                        </motion.button>
                                    </>
                                )}

                                <div className="pt-4 border-t border-gray-100 text-center">
                                    <p className="text-base text-gray-600">
                                        Don't have an account?{' '}
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            type="button"
                                            onClick={() => navigate('/signup')}
                                            className="inline-block font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text hover:opacity-80 transition-opacity"
                                        >
                                            Sign up
                                        </motion.button>
                                    </p>
                                </div>
                            </motion.form>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
    );
};
