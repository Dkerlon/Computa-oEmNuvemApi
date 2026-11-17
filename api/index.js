import { handler } from '../server/index.js';
export default function vercelHandler(req, res) {
  const route = req.query?.route;
  if (typeof route === 'string') req.url = `/api/${route}`;
  return handler(req, res);
}
