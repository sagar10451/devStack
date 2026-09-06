import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'

// Set tab title based on portal
const portal = import.meta.env.VITE_PORTAL as string | undefined;
if (portal === 'chapterBreakdown') {
  document.title = 'ChapterBreakdown by Priyanka & Sagar';
} else if (portal === 'devStack') {
  document.title = 'devStack by Sagar Kumar';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
