import { useAuth } from '../../context/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth: boolean;
}

export function ProtectedRoute({ children, requireAuth }: ProtectedRouteProps) {
  const auth = useAuth();
  const location = useLocation();

  // Add loading check
  if (auth.loading) {
    return null; // or a loading spinner component
  }

  console.log('ProtectedRoute state:', {
    isAuthenticated: auth?.isAuthenticated,
    currentPath: location.pathname
  });

  // Handle non-authenticated routes (like login)
  if (!requireAuth) {
    // If user is authenticated, redirect them away from login/signup pages
    if (auth?.isAuthenticated) {
      console.log('[ProtectedRoute] User is authenticated, redirecting away from login/signup');
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  // Handle authenticated routes
  if (!auth?.isAuthenticated) {
    console.log('[ProtectedRoute] User not authenticated, redirecting to login', {
      currentPath: location.pathname
    });
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
