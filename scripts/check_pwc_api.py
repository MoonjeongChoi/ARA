"""PwC GenAI Gateway 연결 사전 점검."""
from __future__ import annotations
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / "backend" / ".env"

try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:
    print("[!] python-dotenv 미설치. backend/venv 활성화 후 재실행.")
    sys.exit(2)

if not ENV_PATH.exists():
    print(f"[!] {ENV_PATH} 가 없습니다. backend/.env.example 을 복사하여 .env 를 만드세요.")
    sys.exit(2)

load_dotenv(ENV_PATH)
api_key = os.getenv("PwC_LLM_API_KEY", "").strip()
model = os.getenv("PwC_LLM_MODEL", "bedrock.anthropic.claude-sonnet-4-6").strip()
base_url = os.getenv("GENAI_BASE_URL",
    "https://genai-sharedservice-americas.pwcinternal.com").strip()

print("== PwC GenAI Gateway 연결 점검 ==")
print(f"  base_url : {base_url}")
print(f"  model    : {model}")
print(f"  key      : {'(설정됨, 길이=' + str(len(api_key)) + ')' if api_key else '(비어 있음)'}")

if not api_key:
    print("\n[i] 키가 비어 있어 mock 모드로 동작합니다.")
    sys.exit(0)

import httpx  # noqa: E402

t0 = time.perf_counter()
try:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{base_url}/v1/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "input": [{"role": "user", "content": "ping"}],
                "max_tokens": 10,
                "temperature": 0.0,
            },
        )
except httpx.ConnectError as e:
    print(f"\n[X] 네트워크 연결 실패: {e}")
    print("    - PwC 사내 네트워크/VPN 접속 여부 확인")
    print("    - 사내 proxy 설정(HTTP_PROXY / HTTPS_PROXY) 확인")
    sys.exit(1)

latency_ms = (time.perf_counter() - t0) * 1000
if resp.status_code == 200:
    print(f"\n[OK] 연결 OK (latency={latency_ms:.0f}ms)")
    sys.exit(0)
elif resp.status_code in (401, 403):
    print(f"\n[X] 인증 실패 ({resp.status_code}). 키 확인 필요.")
    sys.exit(1)
else:
    print(f"\n[X] 예상치 못한 상태({resp.status_code}). 응답: {resp.text[:300]}")
    sys.exit(1)
