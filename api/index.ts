import { app } from '../server';

export default function handler(req: any, res: any) {
  if (req.headers && req.headers['x-matched-path']) {
    const matched = req.headers['x-matched-path'];
    if (matched.startsWith('/api/') && (!req.url.startsWith('/api/') || req.url === '/api' || req.url === '/api/index')) {
      req.url = matched;
    }
  } else if (req.query && req.query.__path) {
    req.url = '/api/' + req.query.__path;
  }
  return app(req, res);
}
