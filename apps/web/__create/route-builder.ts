import { Hono } from 'hono';
import type { Handler } from 'hono/types';
import updatedFetch from '../src/__create/fetch';

const API_BASENAME = '/api';
const api = new Hono();

if (globalThis.fetch) {
  globalThis.fetch = updatedFetch;
}

// Use static imports via Vite's import.meta.glob for production compatibility
const routeModules = import.meta.glob('../src/app/api/**/route.js', {
  eager: true,
});

// Get all route file paths from the static imports
async function findRouteFiles(): Promise<string[]> {
  const routes = Object.keys(routeModules).map((path) => {
    // Convert from relative Vite path to our expected format
    return path.replace('../src/app/api/', '').replace(/^\/+/, '');
  });

  // Sort by depth (longer paths first for more specific routes)
  return routes.sort((a, b) => b.length - a.length);
}

// Helper function to transform file path to Hono route path
function getHonoPath(routeFile: string): { name: string; pattern: string }[] {
  // routeFile is now just the relative path like "quiz/answer/route.js"
  const parts = routeFile.split('/').filter(Boolean);
  const routeParts = parts.slice(0, -1); // Remove 'route.js'
  if (routeParts.length === 0) {
    return [{ name: 'root', pattern: '' }];
  }
  const transformedParts = routeParts.map((segment) => {
    const match = segment.match(/^\[(\.{3})?([^\]]+)\]$/);
    if (match) {
      const [_, dots, param] = match;
      return dots === '...'
        ? { name: param, pattern: `:${param}{.+}` }
        : { name: param, pattern: `:${param}` };
    }
    return { name: segment, pattern: segment };
  });
  return transformedParts;
}

// Import and register all routes
async function registerRoutes() {
  const routeFiles = await findRouteFiles().catch((error) => {
    console.error('Error finding route files:', error);
    return [];
  });

  // Clear existing routes
  api.routes = [];

  console.log(`🔄 Registering ${routeFiles.length} API routes...`);

  for (const routeFile of routeFiles) {
    try {
      // Get the full path for import
      const fullPath = `../src/app/api/${routeFile}`;
      const route = routeModules[fullPath] as any;

      if (!route) {
        console.error(`Route module not found for ${fullPath}`);
        continue;
      }

      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of methods) {
        try {
          if (route[method]) {
            const parts = getHonoPath(routeFile);
            const honoPath = `/${parts.map(({ pattern }) => pattern).join('/')}`;
            const handler: Handler = async (c) => {
              const params = c.req.param();
              return await route[method](c.req.raw, { params });
            };
            const methodLowercase = method.toLowerCase();
            switch (methodLowercase) {
              case 'get':
                api.get(honoPath, handler);
                console.log(`  ✓ ${method} ${honoPath}`);
                break;
              case 'post':
                api.post(honoPath, handler);
                console.log(`  ✓ ${method} ${honoPath}`);
                break;
              case 'put':
                api.put(honoPath, handler);
                console.log(`  ✓ ${method} ${honoPath}`);
                break;
              case 'delete':
                api.delete(honoPath, handler);
                console.log(`  ✓ ${method} ${honoPath}`);
                break;
              case 'patch':
                api.patch(honoPath, handler);
                console.log(`  ✓ ${method} ${honoPath}`);
                break;
              default:
                console.warn(`Unsupported method: ${method}`);
                break;
            }
          }
        } catch (error) {
          console.error(`Error registering route ${routeFile} for method ${method}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error importing route file ${routeFile}:`, error);
    }
  }

  console.log(`✅ Route registration complete`);
}

// Initial route registration
await registerRoutes();

export { api, API_BASENAME };
