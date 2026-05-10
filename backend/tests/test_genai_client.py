import json
import pytest
from services.genai_client import (
    _extract_json,
    _check_noun_form,
    _extract_component_names,
    MockGenAIClient,
)


# ── _extract_json ──────────────────────────────────────────────────────────

def test_extract_json_empty():
    assert _extract_json("") == ""


def test_extract_json_fenced():
    raw = '```json\n{"key": "value"}\n```'
    result = _extract_json(raw)
    assert json.loads(result) == {"key": "value"}


def test_extract_json_plain():
    raw = '{"key": "value"}'
    assert json.loads(_extract_json(raw)) == {"key": "value"}


def test_extract_json_nested():
    raw = '{"a": {"b": [1, 2, 3]}}'
    assert json.loads(_extract_json(raw)) == {"a": {"b": [1, 2, 3]}}


def test_extract_json_truncated_starts_with_brace():
    raw = '{"key": "val'
    result = _extract_json(raw)
    assert result.startswith("{")


# ── _check_noun_form ───────────────────────────────────────────────────────

def test_check_noun_form_passes():
    assert _check_noun_form("매출채권이 증가함.") is True
    assert _check_noun_form("신규 거래처가 추가됨.") is True
    assert _check_noun_form("전기 대비 증가로 판단됨.") is True
    assert _check_noun_form("추가 검토가 필요함.") is True


def test_check_noun_form_violations():
    assert _check_noun_form("매출채권이 증가했다.") is False
    assert _check_noun_form("수익이 증가이다.") is False
    assert _check_noun_form("비용이 된다.") is False
    assert _check_noun_form("증가세가 보인다.") is False
    assert _check_noun_form("문제가 아니다.") is False
    assert _check_noun_form("자료가 없다.") is False


# ── MockGenAIClient ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mock_complete_json_summary():
    client = MockGenAIClient()
    prompt = "## 전체 합계\n## 분석 대상 구성요소 개요"
    result = await client.complete_json("sys", prompt)
    assert "summary" in result
    assert "(mock)" in result["summary"]


@pytest.mark.asyncio
async def test_mock_complete_json_reasons():
    client = MockGenAIClient()
    prompt = "## 분석 대상 구성요소 (단위: 천원)\n- 거래처A: 전기 1000 당기 1500"
    result = await client.complete_json("sys", prompt)
    assert "components" in result
    assert any("mock" in c.get("reason", "") for c in result["components"])


# ── _extract_component_names ───────────────────────────────────────────────

def test_extract_component_names_dash_format():
    prompt = "- 거래처A: 전기 1000\n- 거래처B: 전기 2000"
    names = _extract_component_names(prompt)
    assert "거래처A" in names
    assert "거래처B" in names


def test_extract_component_names_table_format():
    prompt = "| 거래처X | 개별 | 1,000 | 1,500 | 500 | 50% |"
    names = _extract_component_names(prompt)
    assert "거래처X" in names
