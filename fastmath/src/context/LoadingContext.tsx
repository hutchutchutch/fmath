import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  registerLoadingComponent: (id: string) => void;
  unregisterLoadingComponent: (id: string) => void;
  setComponentLoading: (id: string, loading: boolean) => void;
  loadingComponentsCount: number;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loadingComponents, setLoadingComponents] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadingComponentsCount, setLoadingComponentsCount] = useState(0);

  // Update loading state when components change
  useEffect(() => {
    const loadingCount = Object.values(loadingComponents).filter(loading => loading).length;
    setLoadingComponentsCount(loadingCount);
    
    // Only set isLoading to false if all components are done loading
    if (loadingCount > 0 && !isLoading) {
      setIsLoading(true);
    } else if (loadingCount === 0 && isLoading) {
      // Add a small delay before removing the loading state to prevent flashing
      const timeout = setTimeout(() => {
        setIsLoading(false);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [loadingComponents, isLoading]);

  const registerLoadingComponent = useCallback((id: string) => {
    setLoadingComponents(prev => ({ ...prev, [id]: true }));
  }, []);

  const unregisterLoadingComponent = useCallback((id: string) => {
    setLoadingComponents(prev => {
      const newState = { ...prev };
      delete newState[id];
      return newState;
    });
  }, []);

  const setComponentLoading = useCallback((id: string, loading: boolean) => {
    setLoadingComponents(prev => ({ ...prev, [id]: loading }));
  }, []);

  return (
    <LoadingContext.Provider value={{
      isLoading,
      registerLoadingComponent,
      unregisterLoadingComponent,
      setComponentLoading,
      loadingComponentsCount,
    }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}; 