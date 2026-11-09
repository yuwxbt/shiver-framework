import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as framework from '../src/index.js';
import * as testing from '../src/testing.js';

test('runtime exports and standalone declarations have the same API', () => {
  const entrypoints = [
    [new URL('../types/index.d.ts', import.meta.url), framework],
    [new URL('../types/testing.d.ts', import.meta.url), testing],
  ];
  const files = entrypoints.map(([url]) => fileURLToPath(url));
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  for (const [i, file] of files.entries()) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(file));
    const declared = checker.getExportsOfModule(module)
      .filter((symbol) => {
        const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        return Boolean(target.flags & ts.SymbolFlags.Value);
      })
      .map((symbol) => symbol.getName())
      .sort();
    assert.deepEqual(declared, Object.keys(entrypoints[i][1]).sort());
  }
});
