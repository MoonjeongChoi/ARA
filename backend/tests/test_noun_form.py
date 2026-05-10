import pytest

from services.genai_client import _check_noun_form


@pytest.mark.parametrize("text,expected", [
    ("매출채권이 증가했다.", False),
    ("수익이 증가이다.", False),
    ("비용이 된다.", False),
    ("증가세가 보인다.", False),
    ("문제가 아니다.", False),
    ("자료가 없다.", False),
    ("매출채권이 증가함.", True),
    ("신규 거래처가 추가됨.", True),
    ("전기 대비 증가로 판단됨.", True),
    ("추가 검토가 필요함.", True),
    ("이에 기인함.", True),
])
def test_noun_form(text: str, expected: bool):
    assert _check_noun_form(text) == expected
