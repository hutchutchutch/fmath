import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { processMagicLinkToken } from '../config/api';

interface TokenHandlerProps {
    children?: React.ReactNode;
}

export const TokenHandler = ({ children }: TokenHandlerProps): JSX.Element => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const processingRef = useRef(false);
    
    useEffect(() => {
        const handleToken = async () => {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');
            
            if (token && !processingRef.current) {
                processingRef.current = true;
                try {
                    // Use the new magic link API endpoint
                    const response = await processMagicLinkToken(token);
                    
                    // Handle trackId if present in response
                    if (response.trackId) {
                        // Set in sessionStorage so the progress assessment system uses the correct track
                        sessionStorage.setItem('activeTrackId', response.trackId);
                    }
                    
                    // On success: call AuthContext.login() directly with response data
                    login(response.token, response.user);
                    
                    // Navigate based on trackId presence
                    if (response.takeAssessment) {
                        navigate('/progress-assessment');
                    } else {
                        navigate('/');
                    }
                } catch (error) {
                    console.error('Magic link token processing error:', error);
                    // On failure: navigate to /login
                    navigate('/login');
                } finally {
                    processingRef.current = false;
                }
            }
        };

        handleToken();
    }, [login, navigate]);

    return children ? (
        <>{children}</>
    ) : (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-xl">Checking authentication...</div>
        </div>
    );
}; 