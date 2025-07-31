export * from './colors';
export * from './typography';
export * from './animations';
export * from './layout';

// Common component styles
export const componentStyles = {
  categoryTile: {
    base: 'p-4 rounded-xl border-2 shadow-lg flex flex-col items-center justify-center gap-1 transition-all',
    disabled: 'cursor-default opacity-60',
  },
  button: {
    primary: 'px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-shadow',
    secondary: 'px-6 py-3 text-blue-500 hover:text-blue-600 font-medium bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors',
  },
}; 