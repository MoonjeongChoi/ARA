# ARA — Analytical Review Assistant

> 회계감사 분석적 검토(Analytical Review) 자동화 웹 애플리케이션
>
> **작성자**: 최문정 · choimoonjung95@gmail.com

---

## 빠른 시작 (5분)

### 0. PwC GenAI Gateway 연결 사전 확인

```bash
python scripts/check_pwc_api.py
```

- PwC 사내 키가 있으면: `[OK] 연결 OK (latency=...ms)`
- 키가 없는 외부 환경이면: `[i] 키가 비어 있어 mock 모드로 동작합니다.` — 계속 진행 가능

> **mock 모드**: `backend/.env`의 `PwC_LLM_API_KEY`를 비워두면 백엔드가 자동으로 mock 응답을 반환합니다. 사내 키 없이도 전체 UI 흐름을 시연할 수 있습니다.

### 1. 백엔드 (FastAPI)

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

- 백엔드: http://localhost:8000
- Swagger: http://localhost:8000/docs
- 헬스 체크: `curl http://localhost:8000/health`

> **포트 충돌 시**: `netstat -ano | findstr :8000` (Windows) / `lsof -i :8000` (macOS)으로 확인 후 `uvicorn main:app --reload --port 8001`처럼 포트 변경

### 2. 프론트엔드 (Next.js)

```bash
cd frontend

npm install

copy .env.local.example .env.local   # Windows
# cp .env.local.example .env.local   # macOS / Linux

npm run dev
```

- 프론트엔드: http://localhost:3000

---

## 환경변수

| 파일 | 키 | 설명 |
|------|----|------|
| `backend/.env` | `PwC_LLM_API_KEY` | PwC GenAI Gateway 인증 키 (비우면 자동으로 mock 모드) |
| `backend/.env` | `PwC_LLM_MODEL` | 호출 모델 ID (기본: `bedrock.anthropic.claude-sonnet-4-6`) |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | 백엔드 URL (기본: `http://localhost:8000`) |

---

## 데이터 흐름

```
① 명세서/분개장 파일 업로드 (xlsx / zip)
   → FastAPI /api/parse/ledger
   → ledger_parser: 시트 자동 감지 → 집계/분개 파싱

② 계정과목 구성요소 확정 (LedgerUploadStepper)
   → 프론트: ComponentItem[] 빌드 → localStorage 저장

③ AI 분석 호출
   → Next.js API 프록시 → FastAPI /api/ai/analyze
   → PwC GenAI Gateway (또는 MockGenAIClient) → 총평 + 구성요소별 사유

④ Excel 내보내기
   → FastAPI /api/export/excel → openpyxl → xlsx 다운로드
```

---

## 데이터 처리 정책

파일은 사용자 로컬 백엔드(FastAPI) 프로세스에서만 파싱됩니다. AI 분석에 필요한 최소 정보(계정과목명, 구성요소명, 금액, 상위 3건 적요·날짜)만 PwC GenAI Gateway로 전송됩니다. 거래처 식별 정보가 포함될 수 있으므로, 운영 데이터로 시연할 때는 익명화 후 사용하세요.

> **백엔드 세션**: 파싱 결과는 서버 메모리에 임시 저장됩니다. `uvicorn --workers 1`(기본값) 권장. 재시작 시 세션 휘발.

---

## 프로젝트 구조

```
ara/
├── frontend/                  # Next.js 14 (App Router)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                           # 홈 — 프로젝트 목록
│   │   ├── projects/
│   │   │   ├── [id]/page.tsx                  # 계정과목 목록
│   │   │   └── [id]/accounts/[accountId]/     # 계정과목 상세 + AI 분석
│   │   └── api/ai/analyze/route.ts            # Next.js API 프록시
│   ├── components/
│   │   ├── LedgerUploadStepper.tsx  # 명세서 업로드 + 컬럼 매핑
│   │   ├── AddAccountModal.tsx
│   │   ├── ExportModal.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── types.ts           # 공용 타입 정의
│   │   ├── storage.ts         # localStorage 추상화
│   │   └── api.ts
│   └── tailwind.config.ts     # PwC 색상 토큰
│
├── backend/                   # FastAPI (Python 3.11+)
│   ├── main.py
│   ├── routers/
│   │   ├── parse.py           # /api/parse/ledger, /api/parse/aggregate
│   │   ├── ai.py              # /api/ai/analyze
│   │   └── export.py          # /api/export/excel
│   ├── services/
│   │   ├── genai_client.py    # PwC GenAI Gateway 클라이언트 (mock 자동 전환 포함)
│   │   ├── ledger_parser.py   # 분개장 파싱
│   │   ├── file_parser.py     # ZIP 파싱·집계
│   │   └── excel_exporter.py  # Excel 내보내기
│   └── models/schemas.py      # Pydantic 스키마
│
└── scripts/
    └── check_pwc_api.py       # Gateway 연결 사전 점검
```

---

## 구현 마일스톤

| 단계 | 내용 | 상태 |
|------|------|------|
| M1 | FastAPI + 파일 파싱 + 프로젝트 목록 UI | **완료** |
| M2 | 명세서 업로드 → 컬럼 매핑 → 집계 UI | **완료** (LedgerUploadStepper) |
| M3 | 프로젝트/계정 CRUD + 분석 모드 설정 | **완료** |
| M4 | 직접 정의 모드 (`manual_define`) | **부분 구현** — ZIP 없이 수동 정의 동작, 수동 행 입력 UI 미완 |
| M5 | PwC GenAI Gateway 연동: 총평 + 구성요소별 사유 | **완료** |
| M6 | Excel 내보내기 | **완료** |
| M7 | PwC 디자인 완성 + QA | **진행 중** |

---

## 라이선스

MIT — [LICENSE](./LICENSE)
