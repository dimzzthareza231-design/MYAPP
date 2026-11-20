import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/App';
import { installAuthenticatedFetch } from '../../../src/lib/api';
import '../../../src/index.css';
installAuthenticatedFetch();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
