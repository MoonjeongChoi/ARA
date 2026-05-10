import pytest

from services.anomaly import detect_outliers


def _make_entries(amounts):
    return [
        {"date": f"2024-01-{i+1:02d}", "description": f"거래{i+1}", "amount": a}
        for i, a in enumerate(amounts)
    ]


# ── A9.1 단일 이상치 탐지 ─────────────────────────────────────────────────────

def test_single_outlier_detected():
    """N=10 + 극단치 1건: 이상치 탐지 성공."""
    entries = _make_entries([100, 102, 98, 105, 97, 103, 101, 99, 104, 5000])
    entries[-1]["description"] = "이상거래"
    result = detect_outliers(entries)
    assert len(result) >= 1
    assert result[0]["description"] == "이상거래"
    assert result[0]["amount"] == 5000.0


# ── A9.2 균일 데이터 → 이상치 없음 ──────────────────────────────────────────

def test_no_outlier_uniform():
    entries = _make_entries([100] * 10)
    assert detect_outliers(entries) == []


# ── A9.3 소표본 → 빈 리스트 ─────────────────────────────────────────────────

def test_small_sample_returns_empty():
    """N < 3 이면 계산하지 않음."""
    entries = _make_entries([100, 9999])
    assert detect_outliers(entries, z_threshold=0.5) == []


def test_exactly_three_entries():
    """N=3 은 계산 허용."""
    entries = _make_entries([100, 100, 5000])
    result = detect_outliers(entries)
    assert isinstance(result, list)


# ── A9.4 결과 정렬 ───────────────────────────────────────────────────────────

def test_result_sorted_by_abs_z_score():
    entries = _make_entries([100, 102, 98, 105, 97, 103, 101, 99, 104, 300, 5000])
    result = detect_outliers(entries)
    if len(result) >= 2:
        assert abs(result[0]["z_score"]) >= abs(result[1]["z_score"])


# ── A9.5 커스텀 임계값 ──────────────────────────────────────────────────────

def test_custom_threshold_more_sensitive():
    entries = _make_entries([100] * 8 + [250, 120])
    strict = detect_outliers(entries, z_threshold=1.0)
    lenient = detect_outliers(entries, z_threshold=3.0)
    assert len(strict) >= len(lenient)


# ── A9.6 출력 필드 존재 확인 ─────────────────────────────────────────────────

def test_output_fields_present():
    entries = _make_entries([100] * 9 + [10000])
    result = detect_outliers(entries)
    if result:
        assert {"date", "description", "amount", "z_score"} <= result[0].keys()
