import { html, css, js, planner } from '../generated/assets.js';
import { createHandler } from './handler.js';
export default { fetch: createHandler({
  '/': { body: html, type: 'text/html' },
  '/style.css': { body: css, type: 'text/css' },
  '/client.js': { body: js, type: 'text/javascript' },
  '/planner.js': { body: planner, type: 'text/javascript' }
}) };
