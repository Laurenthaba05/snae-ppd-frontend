import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles.css';
import './institutional.css';
import './archive-modules.css';
const root = document.getElementById('root');
if (!root)
    throw new Error('Point de montage introuvable.');
createRoot(root).render(<App />);
