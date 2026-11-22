export function parseServers(text: string, source?: string): Record<string, string>;
export function defaultServersPath(cwd: string, env?: Record<string, string | undefined>): string;
export function readServersFile(path: string): Record<string, string> | null;
export function frontendFromServers(servers: Record<string, string>, authMode?: string): Record<string, string>;
