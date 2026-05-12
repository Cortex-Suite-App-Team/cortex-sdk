from __future__ import annotations

import json
import os

import pytest

from .scenarios import run_scenario_by_name


@pytest.mark.asyncio
async def test_parity_adapter() -> None:
    scenario = os.environ.get("PARITY_SCENARIO")
    result_path = os.environ.get("PARITY_RESULT_PATH")

    if not scenario or not result_path:
        assert True
        return

    execution = await run_scenario_by_name(scenario)
    with open(result_path, "w", encoding="utf-8") as file:
        json.dump(execution["result"], file, indent=2)

    assert execution["result"]["scenario"] == scenario
