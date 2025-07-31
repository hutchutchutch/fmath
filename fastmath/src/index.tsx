import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as Sentry from '@sentry/react';

// Initialize Sentry with session recording
Sentry.init({
  dsn: "https://29d061acd18e1624db8a9568c5bad1f7@o4508284553396224.ingest.us.sentry.io/4508284556345344",
  enabled: true,
  debug: true, // Enable debug mode to see more detailed logs
  
  // Enable user identification and additional PII data
  sendDefaultPii: true,
  
  integrations: [
    // Add browser tracing integration for better performance monitoring
    Sentry.browserTracingIntegration(),
    
    Sentry.replayIntegration({
      // Session Replay configuration for privacy
      maskAllText: false,
      blockAllMedia: true,
      
      // Filter out admin URLs from being recorded
      beforeAddRecordingEvent: (event) => {
        // Check if current URL contains /admin paths and if so, drop the event
        const currentUrl = window.location.pathname;
        if (currentUrl.startsWith('/admin')) {
          return null; // Return null to drop the event
        }
        return event; // Return the event to keep it
      }
    })
  ],
  // Session Replay configuration
  replaysSessionSampleRate: 1.0, // 100% of sessions will be recorded
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors will be recorded
  
  // Performance monitoring configuration
  tracesSampleRate: 1.0, // 100% of transactions will be captured
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 