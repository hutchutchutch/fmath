import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../config/api';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { motion } from 'framer-motion';
import Logo from '../common/Logo';

export const SignupPage = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [grade, setGrade] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const response = await api.post('/auth/signup', { 
                email, 
                password,
                name,
                ageGrade: parseInt(grade)
            });
            await login(response.data.token, response.data.user);
            if (!localStorage.getItem('token')) {
                throw new Error('Token storage failed');
            }
            navigate('/');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Signup failed');
            localStorage.removeItem('token');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
            <div className="max-w-3xl mx-auto space-y-8 w-full">
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
                    className="w-full"
                >
                    <Card className="w-full space-y-6 p-6 bg-white rounded-lg shadow-md">
                        <CardContent className="w-full space-y-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                                className="text-center space-y-2"
                            >
                                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                                    Create Account
                                </h2>
                                <p className="text-base text-gray-600">Start your math journey today</p>
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

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label htmlFor="name" className="text-gray-700 font-medium text-base">
                                            Name
                                        </label>
                                        <Input
                                            id="name"
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                                            placeholder="Enter your name"
                                            required
                                        />
                                    </div>

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
                                            placeholder="Choose a password"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label htmlFor="grade" className="text-gray-700 font-medium text-base">
                                            Grade Level
                                        </label>
                                        <Input
                                            id="grade"
                                            type="number"
                                            min="0"
                                            max="12"
                                            value={grade}
                                            onChange={(e) => setGrade(e.target.value)}
                                            className="w-full p-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                                            placeholder="Enter your grade (0-12)"
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
                                    <span>{isLoading ? 'Creating Account...' : 'Sign Up'}</span>
                                </motion.button>

                                <div className="pt-4 border-t border-gray-100 text-center">
                                    <p className="text-base text-gray-600">
                                        Already have an account?{' '}
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            type="button"
                                            onClick={() => navigate('/login')}
                                            className="inline-block font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text hover:opacity-80 transition-opacity"
                                        >
                                            Login
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
