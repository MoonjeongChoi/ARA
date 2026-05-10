"""PwC GenAI Gateway async client."""
import asyncio
import json
import logging
import re
import time
from typing import Any
import httpx
from pydantic import Field
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)
MAX_RETRIES = 3
RETRY_DELAY = 2

_BANNED_ENDINGS = re.compile(r"(?:했다|이다|된다|보인다|아니다|없다)\.")


class Settings(BaseSettings):
    GENAI_BASE_URL: str = "https://genai-sharedservice-americas.pwcinternal.com"
    GENAI_API_KEY: str = Field(default="", validation_alias="PwC_LLM_API_KEY")
    GENAI_MODEL: str = Field(
        default="bedrock.anthropic.claude-sonnet-4-6",
        validation_alias="PwC_LLM_MODEL",
    )
    GENAI_TEMPERATURE: float = Field(default=0.1, validation_alias="GENAI_TEMPERATURE")
    GENAI_MAX_TOKENS: int = Field(default=16384, validation_alias="GENAI_MAX_TOKENS")
    model_config = {"env_file": ".env", "extra": "ignore"}

settings = Settings()


def _check_noun_form(text: str) -> bool:
    """명사형 종결어미 규칙 준수 여부 반환 (위반 시 False)."""
    return not bool(_BANNED_ENDINGS.search(text))


class GenAIClient:
    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 120.0):
        self.base_url = base_url
        self.api_key = api_key
        self.model = model
        self.client = httpx.AsyncClient(timeout=timeout)

    async def complete(self, system_prompt: str, user_prompt: str, temperature: float = 0.1, max_tokens: int = 4096) -> str:
        last_error = None
        for attempt in range(MAX_RETRIES):
            t0 = time.perf_counter()
            try:
                response = await self.client.post(
                    f"{self.base_url}/v1/responses",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    json={
                        "model": self.model,
                        "input": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                response.raise_for_status()
                data = response.json()
                try:
                    text = data["output"][0]["content"][0]["text"]
                except (KeyError, IndexError):
                    text = data["choices"][0]["message"]["content"]
                if not text or not text.strip():
                    raise ValueError("Empty response from GenAI Gateway")
                usage = data.get("usage") or {}
                logger.info(
                    "GenAI call ok model=%s in_tokens=%s out_tokens=%s latency_ms=%.0f",
                    self.model,
                    usage.get("input_tokens"),
                    usage.get("output_tokens"),
                    (time.perf_counter() - t0) * 1000,
                )
                return text
            except Exception as e:
                last_error = e
                logger.warning("GenAI attempt %d/%d failed: %s", attempt + 1, MAX_RETRIES, e)
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(RETRY_DELAY * (attempt + 1))
        raise RuntimeError(f"GenAI request failed after {MAX_RETRIES} attempts: {last_error}")

    async def complete_json(self, system_prompt: str, user_prompt: str, **kwargs) -> dict:
        for attempt in range(3):
            raw = await self.complete(
                system_prompt=system_prompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. Do NOT include any explanation or markdown formatting. Output must start with { and end with }.",
                user_prompt=user_prompt,
                **kwargs,
            )
            cleaned = _extract_json(raw)
            if not cleaned:
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                raise json.JSONDecodeError("No JSON object found", raw, 0)
            try:
                result = json.loads(cleaned)
            except json.JSONDecodeError:
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                raise

            summary = result.get("summary", "")
            if summary and not _check_noun_form(summary):
                logger.warning("명사형 종결어미 위반 감지 (attempt %d/3) — 재호출", attempt + 1)
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                logger.warning("명사형 종결어미 위반 — 마지막 시도에서도 위반, 원본 반환")
            return result
        raise RuntimeError("complete_json: 3회 재시도 모두 실패")

    async def close(self):
        await self.client.aclose()


class MockGenAIClient:
    """API 키가 없거나 사외 환경에서 동작하는 mock 응답 클라이언트."""

    model = "mock"

    async def complete(self, system_prompt: str, user_prompt: str, **_) -> str:
        return '{"summary": "(mock) GenAI Gateway 호출이 비활성화된 환경임.", "components": []}'

    async def complete_json(self, system_prompt: str, user_prompt: str, **_) -> dict:
        names = _extract_component_names(user_prompt)
        is_instruction = "감사인 분석 지시" in user_prompt
        is_reasons_only = "분석 대상 구성요소 (단위: 천원)" in user_prompt and "전체 합계" not in user_prompt
        is_summary_only = "전체 합계" in user_prompt and "분석 대상 구성요소 개요" in user_prompt

        if is_instruction:
            sample = names or ["샘플 구성요소 A", "샘플 구성요소 B"]
            return {
                "summary": "(mock) 감사인 지시에 기반한 분석적 절차 요약임.",
                "components": [
                    {"name": n, "beginning": 1000, "ending": 1100 + i * 50,
                     "reason": f"(mock) {n}의 증감은 추가 검토가 필요함."}
                    for i, n in enumerate(sample)
                ],
            }
        if is_summary_only:
            return {"summary": "(mock) 전체 합계 기준 분석적 절차 요약임."}
        if is_reasons_only:
            return {
                "components": [
                    {"name": n, "reason": f"(mock) {n}의 증감 사유는 추가 자료 확인이 필요함."}
                    for n in (names or ["(mock 대상)"])
                ],
            }
        return {"summary": "(mock) 응답임.", "components": []}

    async def close(self):
        return None


def _extract_component_names(user_prompt: str) -> list[str]:
    """프롬프트의 '- 이름: 전기 ...' 또는 '| 이름 | ...' 패턴에서 구성요소 이름 추출."""
    names: list[str] = []
    for line in user_prompt.splitlines():
        m = re.match(r"^-\s+([^:]+):\s+전기", line.strip())
        if m:
            names.append(m.group(1).strip())
            continue
        if line.strip().startswith("|") and "|" in line[1:]:
            parts = [p.strip() for p in line.strip().strip("|").split("|")]
            if len(parts) >= 2 and parts[0] not in ("구성요소", "(없음)") and not parts[0].startswith("---"):
                if not parts[0].isdigit():
                    names.append(parts[0])
    seen: set[str] = set()
    unique: list[str] = []
    for n in names:
        if n and n not in seen:
            seen.add(n)
            unique.append(n)
    return unique[:10]


def _build_client():
    if not settings.GENAI_API_KEY:
        logger.warning("PwC_LLM_API_KEY 가 비어 있어 mock 모드로 동작함.")
        return MockGenAIClient()
    return GenAIClient(
        base_url=settings.GENAI_BASE_URL,
        api_key=settings.GENAI_API_KEY,
        model=settings.GENAI_MODEL,
    )


def _extract_json(raw: str) -> str:
    text = raw.strip()
    if "```" in text:
        fence_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", text)
        if fence_match:
            text = fence_match.group(1).strip()
    if text.startswith("{"):
        return text
    first_brace = text.find("{")
    if first_brace < 0:
        return ""
    depth = 0
    in_string = False
    escape_next = False
    for i in range(first_brace, len(text)):
        ch = text[i]
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            if in_string:
                escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[first_brace:i + 1]
    return text[first_brace:]


genai_client = _build_client()
