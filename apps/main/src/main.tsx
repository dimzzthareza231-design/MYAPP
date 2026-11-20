import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/SecureApp';
import { installAuthenticatedFetch } from '../../../src/lib/api';
installAuthenticatedFetch();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
