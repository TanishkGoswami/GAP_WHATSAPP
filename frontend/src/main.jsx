import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global fetch interceptor to bypass Ngrok's anti-abuse warning screen for all API requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  if (typeof resource === 'string' && resource.includes('ngrok-free.dev')) {
    config = config || {};
    config.headers = {
      ...config.headers,
      'ngrok-skip-browser-warning': 'true' // Bypasses the blue "Visit Site" screen
    };
  }
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
