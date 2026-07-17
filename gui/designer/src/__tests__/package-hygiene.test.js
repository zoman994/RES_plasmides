import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('frontend dependency inventory follows the live application', () => {
  it('does not retain runtimes from retired flow and drag-and-drop surfaces', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
    const dependencies = pkg.dependencies || {};

    for (const retiredDependency of [
      '@xyflow/react',
      'html-to-image',
      'react-dnd',
      'react-dnd-html5-backend',
      'zundo',
    ]) {
      expect(dependencies).not.toHaveProperty(retiredDependency);
    }
  });
});
