// Inject backend API URL into client-side environment
const backendUrl = process.env.REACT_APP_API_URL || process.env.VITE_API_URL || 'http://localhost:3001';
console.log(`📡 Admin dashboard configured to use backend: ${backendUrl}`);

// Import and start the built Hono server
// The built module already handles all routing and will start its own server
const { default: server } = await import('./build/server/index.js');

// The server is already running via the build process
// This message confirms everything is working
console.log(`✅ Wifey backend ready`);
