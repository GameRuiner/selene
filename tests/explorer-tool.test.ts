import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerExplorerTool } from '../lib/explorer-tool';

describe('WebMCP adapter', () => {
  afterEach(() => { Reflect.deleteProperty(globalThis, 'document'); });
  it('registers exact metadata, validates, selects and aborts on cleanup', async () => {
    type RegisteredTool = { name: string; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute(input: unknown): unknown };
    let captured: RegisteredTool | undefined;
    let signal: AbortSignal | undefined;
    const select = vi.fn();
    const testDocument = { modelContext: { registerTool(tool: RegisteredTool, options: { signal: AbortSignal }) { captured = tool; signal = options.signal; } } };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: testDocument });
    const dispose = registerExplorerTool(select);
    await Promise.resolve();
    expect(captured).toBeDefined();
    if (!captured) throw new Error('WebMCP tool was not registered.');
    const tool = captured;
    expect(tool.name).toBe('start_focusing_solar_body');
    expect(tool.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: false });
    expect(tool.execute({ name: 'Earth' })).toEqual({ selected: 'Earth', camera: 'focusing' });
    expect(select).toHaveBeenCalledWith('Earth');
    expect(tool.execute({ name: 'Whole system' })).toEqual({ selected: 'Whole system', camera: 'focusing' });
    expect(select).toHaveBeenLastCalledWith(null);
    expect(() => tool.execute({ name: 'unknown' })).toThrow('Unknown celestial body.');
    expect(() => tool.execute({ name: 'Earth', extra: 1 })).toThrow('Provide a single body name.');
    dispose?.();
    expect(signal?.aborted).toBe(true);
  });
});
