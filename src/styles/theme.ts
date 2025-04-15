import { DefaultTheme } from 'styled-components';

export const theme: DefaultTheme = {
  colors: {
    primary: '#006D77', // Deep teal
    secondary: '#6247AA', // Rich purple
    accent: '#FFD700', // Gold (for sacred elements)
    background: '#1a1a1a', // Default dark mode background
    text: '#E0E0E0', // Light text for dark mode
    lightBackground: '#FFFFFF',
    lightText: '#333333',
    // Add other colors as needed (e.g., error, success)
    error: '#D32F2F',
    success: '#388E3C',
  },
  fonts: {
    primary: '"Montserrat", sans-serif', // Using Montserrat Light requires importing the specific weight
    dyslexiaFriendly: '"OpenDyslexic", sans-serif', // Requires importing/hosting OpenDyslexic font files
  },
  // Add breakpoints, spacing, etc. as needed
  breakpoints: {
    mobile: '768px',
    tablet: '1024px',
  },
  spacing: {
    small: '8px',
    medium: '16px',
    large: '24px',
  }
};

// Add a type definition for the theme for use with styled-components
declare module 'styled-components' {
  export interface DefaultTheme {
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
      text: string;
      lightBackground: string;
      lightText: string;
      error: string;
      success: string;
    };
    fonts: {
      primary: string;
      dyslexiaFriendly: string;
    };
    breakpoints: {
      mobile: string;
      tablet: string;
    };
    spacing: {
      small: string;
      medium: string;
      large: string;
    };
  }
}
