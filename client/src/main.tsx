import React from 'react';
import ReactDOM from 'react-dom/client';
import DashboardApp from './DashboardApp';
import './index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './analytics.css';
import './editorial.css';
import './fire-dashboard.css';


ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><DashboardApp /></React.StrictMode>);
