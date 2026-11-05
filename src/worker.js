import { html, css, js, planner, model, dates, cleaning, seed, exporter } from '../generated/assets.js';
import { createHandler } from './handler.js';
export default { fetch: createHandler({
  '/': { body: html, type: 'text/html' },
  '/style.css': { body: css, type: 'text/css' },
  '/client.js': { body: js, type: 'text/javascript' },
  '/export.js': { body: exporter, type: 'text/javascript' },
  '/planner.js': { body: planner, type: 'text/javascript' },
  '/model.js': {body:model,type:'text/javascript'},
  '/dates.js': {body:dates,type:'text/javascript'},
  '/cleaning.js': {body:cleaning,type:'text/javascript'},
  '/seed.js': {body:seed,type:'text/javascript'}
}) };
