import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import Theme from './components/Theme';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><Theme /><App /></BrowserRouter></React.StrictMode>);
