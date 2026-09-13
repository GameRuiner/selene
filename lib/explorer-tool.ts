import { bodies, type BodyName } from './solar-data';

type ModelContext = {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => unknown;
  }, options: { signal: AbortSignal }): void | Promise<void>;
};

// Optional browser capability. Ordinary browsers use the visible controls.
export function registerExplorerTool(select: (name: BodyName | null) => void) {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  try {
    void Promise.resolve(context.registerTool({
      name: 'start_focusing_solar_body',
      description: 'Select a celestial body and start following it in the visible solar system. Use Whole system for an overview.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', enum: ['Whole system', ...bodies.map((body) => body.name)] } }, required: ['name'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).length !== 1 || !('name' in input)) throw new Error('Provide a single body name.');
        const name = input.name;
        if (name !== 'Whole system' && !bodies.some((body) => body.name === name)) throw new Error('Unknown celestial body.');
        select(name === 'Whole system' ? null : name as BodyName);
        return { selected: name, camera: 'focusing' };
      },
    }, { signal: lifecycle.signal })).catch(() => lifecycle.abort());
  } catch { lifecycle.abort(); }
  return () => lifecycle.abort();
}
