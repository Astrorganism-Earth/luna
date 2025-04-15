import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from 'styled-components';
import { theme } from './styles/theme.ts';
import { GlobalStyle } from './styles/GlobalStyle.ts';
import './i18n'; // Initialize i18next
import { AuthProvider } from './context/AuthContext'; 

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <App />
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
