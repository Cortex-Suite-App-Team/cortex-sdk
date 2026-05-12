import { SCENARIO_NAMES, runScenarioByName } from './scenarios.js';

describe('schema_conformance', () => {
  it.each(SCENARIO_NAMES)('%s has no outbound schema violations', async (scenario) => {
    const execution = await runScenarioByName(scenario, { schemaValidation: true });
    expect(execution.schema_violations).toEqual([]);
  });
});
