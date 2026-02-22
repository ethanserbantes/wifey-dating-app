import express from 'express';
import { createReadableStreamFromReadable } from '@react-router/node';

const app = express();

// Inject backend API URL into client-side environment
const backendUrl = process.env.REACT_APP_API_URL || process.env.VITE_API_URL || 'http://localhost:3001';
console.log(`📡 Admin dashboard configured to use backend: ${backendUrl}`);

// Serve static assets in production
app.use(express.static('build/client', { maxAge: '1y' }));

// Import the built server module
const { default: handler } = await import('./build/server/index.js');

// Handle all routes with React Router
app.all('*', async (req, res, next) => {
  try {
    const response = await handler(req);
    
    // Handle response
    res.status(response.status || 200);
    
    // Set response headers
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    
    // Stream response body
    if (response.body) {
      const readable = createReadableStreamFromReadable(response.body);
      readable.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Route handler error:', error);
    next(error);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
