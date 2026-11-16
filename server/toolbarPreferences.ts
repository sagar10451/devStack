import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface Preferences { version: 1; lessons: Record<string, string[]> }
export function validateHiddenTools(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(id))) throw new Error('Invalid toolbar choices.');
  return [...new Set(value)];
}
function validateKey(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Invalid lesson key.');
  const parts: unknown = JSON.parse(value);
  if (!Array.isArray(parts) || parts.length !== 3 || parts.some(part => typeof part !== 'string')) throw new Error('Invalid lesson key.');
  return value;
}
function readPreferences(path: string): Preferences {
  if (!existsSync(path)) return { version: 1, lessons: {} };
  const data = JSON.parse(readFileSync(path, 'utf8')) as Preferences;
  if (data.version !== 1 || !data.lessons || typeof data.lessons !== 'object' || Array.isArray(data.lessons)) throw new Error('Invalid toolbar preferences file.');
  return data;
}

export function loadToolbarPreferences(path: string, key: string): string[] | null {
  validateKey(key);
  const choices = readPreferences(path).lessons[key];
  return choices === undefined ? null : validateHiddenTools(choices);
}
export function saveToolbarPreferences(path: string, key: string, hiddenTools: unknown) {
  validateKey(key);
  const choices = validateHiddenTools(hiddenTools);
  // Read on each write so changing one lesson preserves every other lesson.
  const data = readPreferences(path);
  data.lessons[key] = choices;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}

export function toolbarPreferencesMiddleware(path: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, data: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(data));
    };
    if (req.method === 'GET') {
      try {
        const key = new URL(req.url || '', 'http://localhost').searchParams.get('key') || '';
        reply(200, { hiddenTools: loadToolbarPreferences(path, key) });
      } catch (error) { reply(400, { error: (error as Error).message }); }
      return;
    }
    if (req.method !== 'POST') { reply(405, { error: 'Method not allowed.' }); return; }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { key, hiddenTools } = JSON.parse(body);
        saveToolbarPreferences(path, key, hiddenTools);
        reply(200, { success: true });
      } catch (error) { reply(400, { error: (error as Error).message }); }
    });
  };
}
