# ARA — Analytical Review Assistant

> **회계감사 분석적 검토(Analytical Review) 자동화 웹 애플리케이션**
>
> 명세서·분개장 업로드 → AI 총평 + 구성요소별 사유 자동 생성 → Excel 워크페이퍼 내보내기
>
> **작성자**: 최문정 · choimoonjung95@gmail.com

[![CI](https://github.com/MoonjeongChoi/ARA/actions/workflows/ci.yml/badge.svg)](https://github.com/MoonjeongChoi/ARA/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 스크린샷

> 실제 시연 스크린샷은 더미 데이터(`samples/sample_ledger_2024.xlsx`)를 사용합니다.
> 아래 순서대로 5분 안에 전체 흐름을 확인할 수 있습니다.

| ① 프로젝트 목록 | ② 명세서 업로드 & 컬럼 감지 | ③ AI 분석 + 위험도 뱃지 |
|:-:|:-:|:-:|
| 새 프로젝트 생성 → 회사명·회계연도 입력 | ZIP/xlsx 드래그 → 시트 자동 감지 | AI 사유 생성, 이상치 강조, 파레토 차트 |

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **명세서 파싱** | xlsx/zip 업로드 → 집계·분개 시트 자동 감지 → 구성요소 테이블 구성 |
| **AI 분석** | PwC GenAI Gateway 연동 (mock 자동 전환 지원) — 분석적 절차 총평 + 구성요소별 사유 |
| **이상치 탐지** | Z-score 기반 거래처 분개 이상치 자동 감지 → AI 프롬프트 hint 주입 |
| **Risk Score** | 변동률·비중·신규/소멸·중요성 기준 위험도 자동 산출 (L/M/H/Critical) |
| **분개 드릴다운** | 거래처별 분개 내역 모달 — 이상치 행 시각 강조 |
| **파레토 차트** | 잔액 분포 막대+누적선 차트 — 상위 N개가 전체 잔액의 X% 구성 |
| **Excel 내보내기** | PwC 워크페이퍼 형식 xlsx 다운로드 |
| **자동 저장** | 키 입력 시 500ms 디바운스 무음 저장 + 메타바 "최근 저장" 표시 |

---

## 빠른 시작 (5분)

### 0. PwC GenAI Gateway 연결 사전 확인

```bash
python scripts/check_pwc_api.py
```

- PwC 사내 키 있음: `[OK] 연결 OK (latency=...ms)`
- 키 없는 외부 환경: `[i] 키가 비어 있어 mock 모드로 동작합니다.` → **계속 진행 가능**

> **mock 모드**: `backend/.env`의 `PwC_LLM_API_KEY`를 비워두면 백엔드가 자동으로 mock 응답을 반환합니다. 사내 키 없이도 전체 UI 흐름 시연이 가능합니다.

### 1. 백엔드 (FastAPI · Python 3.11+)

```bash
cd backend

python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

pip install -r requirements.txt

copy .env.example .env       # Windows
# cp .env.example .env       # macOS / Linux

# (선택) .env 에 PwC_LLM_API_KEY 값 입력 — 비우면 mock 모드
uvicorn main:app --reload
```

- 백엔드: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- 헬스 체크: `curl http://localhost:8000/health`

> **포트 충돌**: `netstat -ano | findstr :8000` (Windows) / `lsof -i :8000` (macOS) 확인 후 `--port 8001`

### 2. 프론트엔드 (Next.js 14 · Node.js 20+)

```bash
cd frontend

npm install

copy .env.local.example .env.local   # Windows
# cp .env.local.example .env.local   # macOS / Linux

npm run dev
```

- 프론트엔드: `http://localhost:3000`

### 3. 더미 데이터로 시연

1. `samples/sample_ledger_2024.xlsx` 를 준비합니다 (아래 생성 스크립트 참고)
2. 새 프로젝트 생성 → 계정 추가 (예: `매입채무`, `ZIP 업로드` 모드)
3. `sample_ledger_2024.xlsx` 업로드 → 구성요소 확정
4. **AI 사유 생성** 버튼 클릭 (mock 모드: 즉시 응답)
5. 파레토 차트 토글, 거래처 행의 **보기** 클릭으로 드릴다운
6. **Excel Export** → 워크페이퍼 다운로드

#### 더미 데이터 생성 스크립트

```bash
cd samples
python generate_sample.py
# → sample_ledger_2024.xlsx 생성
```

---

## 환경변수

| 파일 | 키 | 기본값 | 설명 |
|------|----|--------|------|
| `backend/.env` | `PwC_LLM_API_KEY` | _(비움 = mock)_ | PwC GenAI Gateway 인증 키 |
| `backend/.env` | `PwC_LLM_MODEL` | `bedrock.anthropic.claude-sonnet-4-6` | 호출 모델 ID |
| `backend/.env` | `CORS_ORIGINS` | `http://localhost:3000` | 허용 origin (콤마 구분) |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | 백엔드 URL |

---

## 기능 상세

### A1 — 이상치 자동 탐지 (Z-score)

거래처별 분개 금액의 Z-score를 계산하여 `|z| > 2` 인 건을 이상치로 분류합니다.

- AI 프롬프트에 자동 삽입: `"통계적 이상치 (|z|>2): N건. 예: <적요> / <금액>천원 (z=...)"` 
- 백엔드 로그: `AI analyze outlier_count=N`
- **한계**: N < 10 의 소표본에서는 단일 극단치가 평균을 끌어올려 자신의 z-score가 임계값 미만으로 떨어질 수 있음 (classical z-score 마스킹 효과). 향후 Robust z-score (median + MAD) 도입 후보.

### A2 — Risk Score

```
score = 변동률 점수(0~30) + 비중 점수(0~30) + 신규/소멸 가산(+20) + 중요성 초과 가산(+20)
level: < 25 → low / < 50 → medium / < 75 → high / 75+ → critical
```

컴포넌트 테이블 각 행에 위험도 뱃지(L/M/H/!) 표시. hover 시 점수 툴팁.

### B3 — 분개 드릴다운 (JournalDrawer)

- 분개 데이터가 있는 거래처 행에 **보기 (N)** 버튼 표시
- 클릭 시 Modal로 분개 내역 (금액 내림차순) + 이상치 행 강조
- 새로고침 후 분개 데이터 휘발 시: 안내 메시지 표시 (R-21 대응)

### B2 — 파레토 차트

- 계정과목 상세 상단 토글(기본 접힘)
- recharts ComposedChart: 막대(당기 금액) + 라인(누적 비중%)
- 캡션: "상위 N개 항목이 전체 잔액의 X%를 구성함"

---

## 데이터 흐름

```
① 명세서/분개장 파일 업로드 (xlsx / zip)
   → FastAPI /api/parse/ledger
   → ledger_parser: 시트 자동 감지 → 집계/분개 파싱 → 컬럼 매핑 (LedgerColumnMapping)

② 계정과목 구성요소 확정 (LedgerUploadStepper)
   → 프론트: ComponentItem[] + journalByVendor 빌드
   → localStorage 저장 (journalByVendor는 메모리에만, stripVolatile)

③ AI 분석 호출
   → Next.js API 프록시 → FastAPI /api/ai/analyze
   → anomaly.detect_outliers → 이상치 hint 주입
   → PwC GenAI Gateway (또는 MockGenAIClient) → 총평 + 구성요소별 사유

④ Excel 내보내기
   → FastAPI /api/export/excel → openpyxl → xlsx 다운로드
```

---

## 데이터 처리 정책

파일은 사용자 로컬 백엔드(FastAPI) 프로세스에서만 파싱됩니다. AI 분석에 필요한 최소 정보(계정과목명, 구성요소명, 금액, 상위 3건 적요·날짜)만 PwC GenAI Gateway로 전송됩니다. 거래처 식별 정보가 포함될 수 있으므로, 운영 데이터로 시연할 때는 익명화 후 사용하세요.

> **백엔드 세션**: 파싱 결과는 서버 메모리에 임시 저장됩니다. `uvicorn --workers 1` (기본값) 권장. 재시작 시 세션 휘발.

---

## 프로젝트 구조

```
ara/
├── frontend/                   # Next.js 14 (App Router, TypeScript)
│   ├── app/
│   │   ├── page.tsx                           # 홈 — 프로젝트 목록
│   │   ├── projects/[id]/page.tsx             # 계정과목 목록
│   │   └── projects/[id]/accounts/[accountId]/page.tsx  # 계정과목 상세 + AI 분석
│   ├── components/
│   │   ├── ui/Button.tsx, Modal.tsx           # PwC 디자인 primitive
│   │   ├── LedgerUploadStepper.tsx            # 명세서 업로드 + 컬럼 매핑
│   │   ├── JournalDrawer.tsx                  # 분개 드릴다운 모달
│   │   └── charts/ParetoChart.tsx             # 파레토 차트 (recharts)
│   ├── lib/
│   │   ├── types.ts            # 공용 타입
│   │   ├── storage.ts          # localStorage 추상화
│   │   ├── risk.ts             # Risk Score 계산
│   │   └── api.ts
│   └── tailwind.config.ts      # PwC 색상 토큰
│
├── backend/                    # FastAPI (Python 3.11+)
│   ├── routers/
│   │   ├── parse.py            # /api/parse/ledger, /api/parse/aggregate
│   │   ├── ai.py               # /api/ai/analyze (이상치 hint 주입 포함)
│   │   └── export.py           # /api/export/excel
│   ├── services/
│   │   ├── genai_client.py     # PwC GenAI Gateway (mock 자동 전환)
│   │   ├── anomaly.py          # Z-score 이상치 탐지
│   │   ├── ledger_parser.py    # 분개장 파싱 + 컬럼 감지
│   │   ├── file_parser.py      # ZIP 파싱·집계
│   │   ├── excel_exporter.py   # Excel 내보내기
│   │   └── prompts/            # Jinja2 프롬프트 템플릿
│   ├── models/schemas.py       # Pydantic 스키마
│   └── tests/                  # pytest (80 케이스)
│
├── samples/                    # 시연용 더미 분개장 (실제 회사 데이터 아님)
├── docs/demo-scenario.md       # 시연 시나리오
└── scripts/check_pwc_api.py    # Gateway 연결 사전 점검
```

---

## 구현 마일스톤

| 단계 | 내용 | 상태 |
|------|------|------|
| M1 | FastAPI + 파일 파싱 + 프로젝트 목록 UI | ✅ 완료 |
| M2 | 명세서 업로드 → 컬럼 매핑 → 집계 UI | ✅ 완료 (LedgerUploadStepper) |
| M3 | 프로젝트/계정 CRUD + 분석 모드 설정 | ✅ 완료 |
| M4 | 직접 정의 모드 (`manual_define`) | ✅ 완료 (ZIP 없이 수동 행 입력) |
| M5 | PwC GenAI Gateway: 총평 + 구성요소별 사유 | ✅ 완료 |
| M6 | Excel 내보내기 (PwC 워크페이퍼 형식) | ✅ 완료 |
| M7 | PwC 디자인 완성 (토큰·primitive·raw-hex 제거) | ✅ 완료 |
| M8 | 도메인 고도화: 이상치·Risk Score·드릴다운·파레토 | ✅ 완료 |

---

## 개발 · 테스트

```bash
# 백엔드 테스트 (pytest, 80 케이스)
cd backend
source venv/bin/activate   # Windows: venv\Scripts\activate
pytest -q

# 린터
ruff check .

# 프론트 테스트 (vitest, 19 케이스)
cd frontend
npm test

# 린터
npm run lint
```

---

## 라이선스

MIT — [LICENSE](./LICENSE)
