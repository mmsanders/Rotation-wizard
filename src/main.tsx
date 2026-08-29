import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { importSceneFromHash } from './share/importOnBoot';
import './styles.css';
import './ui/ui.css';

// Before the first render, so a shared scene is what actually paints rather than a flash
// of the previous one.
importSceneFromHash();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
