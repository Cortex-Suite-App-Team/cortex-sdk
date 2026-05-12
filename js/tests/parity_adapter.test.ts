import { writeFileSync } from 'node:fs';

import { runScenarioByName, type ScenarioName } from './scenarios.js';

const scenario = process.env['PARITY_SCENARIO'] as ScenarioName | undefined;
const resultPath = process.env['PARITY_RESULT_PATH'];

describe('parity_adapter', () => {
  it('writes one scenario result for the parity runner', async () => {
    if (!scenario || !resultPath) {
      expect(true).toBe(true);
      return;
    }

    const execution = await runScenarioByName(scenario);
    writeFileSync(resultPath, JSON.stringify(execution.result, null, 2), 'utf-8');
    expect(execution.result.scenario).toBe(scenario);
  });
});
