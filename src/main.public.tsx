import './utils/storage'; // Load safe localStorage polyfill first
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import PublicApp from './PublicApp.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicApp />
  </StrictMode>,
);
