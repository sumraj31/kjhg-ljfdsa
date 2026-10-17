import { app } from '../server';

export default function handler(req: any, res: any) {
  if (req.query && req.query.__path) {
    req.url = '/api/' + req.query.__path;
  }
  return app(req, res);
}
