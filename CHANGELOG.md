# CHANGELOG

ARA — Analytical Review Assistant 변경 이력

---

## [Unreleased]

---

## [0.8.0] — 2026-05-10 · Phase 8: 도메인 고도화 패키지

### Added
- **A1 이상치 탐지**: `services/anomaly.py` — Z-score 기반 `detect_outliers()`, `|z| > 2` 이상치 분류
- **A1 AI hint 주입**: `routers/ai.py` — reasons 프롬프트에 이상치 정보 자동 삽입, `outlier_count=N` 로깅
- **A2 Risk Score**: `lib/risk.ts` — `computeRiskScore()` (변동률·비중·신규/소멸·중요성 초과), 컴포넌트 테이블 위험도 뱃지 (L/M/H/!)
- **B3 분개 드릴다운**: `components/JournalDrawer.tsx` — Modal primitive 기반, 금액 내림차순, 이상치 행 `bg-pwc-redSoft` 강조
- **B2 파레토 차트**: `components/charts/ParetoChart.tsx` — recharts ComposedChart (막대 + 누적선), 접기/펼치기 토글
- `tests/test_anomaly.py` 6 케이스 추가 (총 80 passed)

### Changed
- `routers/ai.py`: `detect_outliers` 호출 + outlier hint 문자열 reasons_blocks에 추가
- `[accountId]/page.tsx`: JournalDrawer, ParetoChart, Risk Score 뱃지 통합; 테이블 헤더에 위험도 열 추가

### Dependency
- `frontend/package.json`: `recharts ^3.x` 추가

---

## [0.6.0] — 2026-05-10 · Phase 6: UX 강화

### Added
- `Modal.tsx`: ESC 키 `keydown` 리스너 등록 (모든 Modal 인스턴스에서 자동 동작)
- `[accountId]/page.tsx`: AI 호출 단계 표시 (`aiStep`: 요약 생성 중 → 사유 생성 중)
- `[accountId]/page.tsx`: 무음 자동 저장 + 메타바 "최근 저장: N초 전" 표시 (`lastSavedDisplay`)

### Changed
- `scheduleAutoSave`: `setToast('자동 저장되었습니다')` 제거, `setLastSavedAt(Date.now())` 대체
- 토스트는 상태 변경·Excel export·AI 완료 시에만 표시

---

## [0.5.0] — 2026-05-10 · Phase 5: 테스트 · CI

### Added
- `backend/tests/test_file_parser.py` — `detect_date_from_filename`, `infer_file_unit` 12 케이스
- `backend/tests/test_aggregate.py` — 세션 TTL 만료 등 6 케이스
- `backend/tests/test_ledger_parser.py` — `_find_col`, `_detect_header_row`, `_parse_movement`, `_parse_summary`, `_safe_float`, `_matches_filter`, `_detect_sheets` 23 케이스
- `frontend/lib/utils.test.ts` — 11 케이스
- `frontend/lib/storage.test.ts` — 8 케이스 (`stripVolatile` 동작 검증)
- `.github/workflows/ci.yml` — backend pytest + frontend vitest + build + ruff + eslint
- `backend/ruff.toml`, `frontend/eslint.config.mjs`

### Changed
- `frontend/package.json`: `vitest`, `jsdom` devDependencies 추가

---

## [0.4.0] — 2026-05-10 · Phase 4: 데이터 파이프라인 견고화

### Added
- `models/schemas.py`: `LedgerColumnMapping`, `SummaryColumnMapping` Pydantic 모델
- `services/ledger_parser.py`: `_find_col()` 2단계 키워드 탐지, `_detect_header_row()` 한글 키워드 보강
- `LedgerUploadStepper.tsx`: `DetectedColumnsPanel` — 감지된 컬럼명 표시

### Changed
- `routers/parse.py`: `column_mapping` Form 파라미터 추가 (`LedgerColumnMapping` 오버라이드)

---

## [0.3.0] — 2026-05-10 · Phase 3: AI 분석 품질 · 관측성

### Added
- `services/prompts/`: Jinja2 템플릿 (`system.md`, `analyze_summary.md.j2`, `analyze_reasons.md.j2`, `analyze_instruction.md.j2`)
- `services/genai_client.py`: 토큰·latency 로깅 (`in_tokens`, `out_tokens`, `latency_ms`)
- 명사형 종결어미 검증 (`~다.` 금지, `BANNED_ENDINGS`)
- `tests/test_noun_form.py`, `tests/test_genai_client.py`

### Changed
- `routers/ai.py`: 프롬프트 인라인 f-string → Jinja2 렌더링
- README: 데이터 처리 정책 단락 추가

---

## [0.2.0] — 2026-05-10 · Phase 2: PwC 디자인 시스템 정렬

### Added
- `tailwind.config.ts`: `pwc` 토큰 확장 (redHover, redSoft, neutral100/200/400, infoSoft)
- `app/globals.css`: CSS 변수 (`--pwc-red`, `--pwc-text` 등 8종)
- `components/ui/Button.tsx`: `primary` / `secondary` / `ghost` variant
- `components/ui/Modal.tsx`: backdrop + header + body + footer slot

### Changed
- 인라인 raw hex (`bg-[#FDECEA]` 등) → Tailwind 토큰 일괄 치환
- `italic` 사용 0건으로 정리 (PwC 디자인 규칙 1)

---

## [0.1.0] — 2026-05-10 · Phase 1: 안정성 · 타입 안전성

### Added
- 파일 업로드 사이즈 가드 (50 MB 초과 → 400)
- 에러 메시지 정형화 (pandas raw 메시지 차단)
- `_sessions` TTL 도입 (30분 무사용 GC)
- CORS 환경변수화 (`CORS_ORIGINS`)
- `frontend/lib/types.ts` ↔ `backend/models/schemas.py` 타입 동기화

---

## [0.0.0] — 2026-05-10 · Phase 0: 환경 정합성

### Fixed
- `.env.example`: `ANTHROPIC_API_KEY` → `PwC_LLM_API_KEY` / `PwC_LLM_MODEL` 정합화
- `frontend/package.json`: `@anthropic-ai/sdk` dead dependency 제거
- `frontend/tsconfig.json`: `"target": "es2020"` 추가 (Set iteration 빌드 오류 방지)
- `frontend/app/layout.tsx`: Noto Sans KR weight 배열에 `'600'` 추가

### Added
- `services/genai_client.py`: `MockGenAIClient` 자동 전환 (키 비움 시)
- `scripts/check_pwc_api.py`: Gateway 연결 사전 점검 스크립트
- `LICENSE`: MIT
- `.gitignore`: `*.xlsx`, `*.xlsb`, `*.zip` 회계 데이터 우발적 push 방지

---

> 환경변수 명이 초기 커밋의 `ANTHROPIC_API_KEY`에서 `PwC_LLM_API_KEY`로 Phase 0에서 정합화됨.
