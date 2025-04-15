import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  /* Import Fonts Here (Example using Google Fonts - replace with your method) */
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;700&display=swap');
  /* You'll need to host or find a CDN for OpenDyslexic */

  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 16px; /* Base font size */
  }

  body {
    background-color: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.primary}; // Default to Montserrat
    font-weight: 300; // Use Montserrat Light by default
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  /* Add other global styles: links, headings, etc. */
  a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: none;
    transition: color 0.2s ease-in-out;

    &:hover {
      color: ${({ theme }) => theme.colors.accent};
    }
  }

  h1, h2, h3, h4, h5, h6 {
    font-weight: 700;
    margin-bottom: ${({ theme }) => theme.spacing.medium};
  }

  /* Custom cursor (basic example) */
  /* For a trail effect, more complex CSS or JS might be needed */
  /* body {
    cursor: url('/path/to/custom-cursor.png'), auto; 
  } */

  /* Basic accessibility reset */
  button, input, select, textarea {
    font-family: inherit;
    font-size: inherit;
  }
`;
