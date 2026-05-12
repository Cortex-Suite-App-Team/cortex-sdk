from __future__ import annotations

import pytest

from .scenarios import SCENARIO_NAMES, run_scenario_by_name


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", SCENARIO_NAMES)
async def test_schema_conformance(scenario: str) -> None:
    execution = await run_scenario_by_name(scenario, schema_validation=True)
    assert execution["schema_violations"] == []
