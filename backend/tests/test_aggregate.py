import time

import pandas as pd
import pytest

from services.file_parser import SESSION_TTL, _sessions, aggregate_data, store_session


def _make_session(df: pd.DataFrame) -> str:
    session_id = "test-session-aggregate"
    store_session(session_id, df)
    return session_id


@pytest.fixture(autouse=True)
def cleanup_sessions():
    _sessions.clear()
    yield
    _sessions.clear()


# ── aggregate_data ────────────────────────────────────────────────────────────

def test_aggregate_basic_sum():
    df = pd.DataFrame({
        "거래처": ["A", "A", "B"],
        "금액":  [1000.0, 2000.0, 500.0],
    })
    sid = _make_session(df)
    result = aggregate_data(sid, "금액", None, None, None, None, None)
    assert result["total"] == pytest.approx(3500.0)
    assert result["items"][0]["name"] == "전체 합계"


def test_aggregate_group_by():
    df = pd.DataFrame({
        "거래처": ["A", "A", "B", "B"],
        "금액":  [1000.0, 2000.0, 500.0, 300.0],
    })
    sid = _make_session(df)
    result = aggregate_data(sid, "금액", "거래처", None, None, None, None)
    names = {item["name"] for item in result["items"]}
    assert "A" in names
    assert "B" in names
    a_item = next(i for i in result["items"] if i["name"] == "A")
    assert a_item["amount"] == pytest.approx(3000.0)
    assert a_item["is_individual"] is True


def test_aggregate_materiality_split():
    df = pd.DataFrame({
        "거래처": ["A", "B", "C"],
        "금액":  [9000.0, 1500.0, 400.0],
    })
    sid = _make_session(df)
    result = aggregate_data(sid, "금액", "거래처", None, None, None, 1000.0)
    names = {i["name"] for i in result["items"]}
    assert "A" in names
    assert "B" in names
    assert "기타" in names
    c_item = next((i for i in result["items"] if i["name"] == "C"), None)
    assert c_item is None  # C is merged into 기타


def test_aggregate_missing_session():
    with pytest.raises(ValueError, match="세션을 찾을 수 없습니다"):
        aggregate_data("nonexistent-id", "금액", None, None, None, None, None)


def test_aggregate_missing_column():
    df = pd.DataFrame({"금액": [100.0, 200.0]})
    sid = _make_session(df)
    with pytest.raises(ValueError, match="컬럼을 찾을 수 없습니다"):
        aggregate_data(sid, "없는컬럼", None, None, None, None, None)


# ── Session TTL ───────────────────────────────────────────────────────────────

def test_session_ttl_expiry():
    df = pd.DataFrame({"v": [1, 2, 3]})
    sid = "ttl-test-session"
    store_session(sid, df)

    # 세션 만료 시간을 과거로 조작
    _sessions[sid] = (_sessions[sid][0], time.time() - SESSION_TTL - 1)

    result_df = None
    from services.file_parser import get_session
    result_df = get_session(sid)
    assert result_df is None, "만료된 세션은 None을 반환해야 한다"
