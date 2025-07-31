import axios, { InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

// Add type augmentation for Axios config to support metadata
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    
    if (token && config.headers) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Add request start time for tracking response time
    config.metadata = { startTime: new Date().getTime() };
    
    return config;
}, error => {
    return Promise.reject(error);
});

api.interceptors.response.use(
    (response: AxiosResponse) => {
        // Calculate response time
        const config = response.config;
        if (config.metadata?.startTime) {
            const responseTime = new Date().getTime() - config.metadata.startTime;
            
            // Only log slow responses (> 1000ms)
            if (responseTime > 1000) {
                console.warn(`[API] Slow response detected (${responseTime}ms):`, {
                    url: config.url,
                    method: config.method,
                    status: response.status
                });
            }
        }
        return response;
    },
    (error: AxiosError) => {
        // Calculate response time for errors too
        if (error.config?.metadata?.startTime) {
            const responseTime = new Date().getTime() - error.config.metadata.startTime;
            
            // Add response time to error logs
            if (!error.response) {
                console.error('[API] Network error:', error.message, {
                    url: error.config?.url,
                    method: error.config?.method,
                    timeoutSet: error.config?.timeout || 'default',
                    responseTime: `${responseTime}ms`,
                    timestamp: new Date().toISOString(),
                    onLine: navigator.onLine,
                    effectiveType: (navigator as any).connection?.effectiveType || 'unknown',
                    actionPath: window.location.pathname
                });
            }
        }
        
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        
        return Promise.reject(error);
    }
); 