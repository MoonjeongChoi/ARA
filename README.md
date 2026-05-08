# ARA — Analytical Review Assistant

회계감사 분석적 검토(Analytical Review) 자동화 웹 애플리케이션

## 로컬 실행 방법

### 백엔드 (FastAPI)

```bash
cd backend

# 가상환경 생성 및 활성화
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

pip install -r requirements.txt

# 환경변수 설정 (Claude API 키)
copy .env.example .env       # Windows
# cp .env.example .env       # macOS / Linux

uvicorn main:app --reload
```

- 백엔드 서버: http://localhost:8000
- API 문서 (Swagger): http://localhost:8000/docs

### 프론트엔드 (Next.js)

```bash
cd frontend

npm install

copy .env.local.example .env.local   # Windows
# cp .env.local.example .env.local   # macOS / Linux

npm run dev
```

- 프론트엔드 서버: http://localhost:3000

---

## 환경변수

| 파일 | 키 | 설명 |
|------|----|------|
| `backend/.env` | `ANTHROPIC_API_KEY` | Claude API 키 (M5 단계에서 사용) |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | 백엔드 URL (기본: `http://localhost:8000`) |

---

## API 테스트 (curl)

### ZIP 파일 파싱

```bash
curl -X POST "http://localhost:8000/api/parse/zip" \
  -H "accept: application/json" \
  -F "file=@경로/파일.zip"
```

### 데이터 집계

```bash
curl -X POST "http://localhost:8000/api/parse/aggregate" \
  -H "Content-Type: application/json" \
  -d '{
    "zip_session_id": "<parse/zip 응답의 session_id>",
    "amount_column": "공급가액",
    "group_column": "거래처",
    "start_date": "2024-01-01",
    "end_date": "2024-09-30",
    "materiality_amount": 50000000
  }'
```

---

## 프로젝트 구조

```
ara/
├── frontend/                  # Next.js 14 (App Router)
│   ├── app/
│   │   ├── layout.tsx         # 루트 레이아웃 (폰트, 메타데이터)
│   │   ├── page.tsx           # 홈 — 프로젝트 목록
│   │   └── globals.css
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── ProjectCard.tsx
│   │   └── NewProjectModal.tsx
│   ├── lib/
│   │   ├── types.ts           # 공용 타입 정의
│   │   └── storage.ts         # localStorage 추상화 (추후 Supabase 교체 지점)
│   ├── package.json
│   ├── tailwind.config.ts     # PwC 색상 포함
│   └── tsconfig.json          # strict mode 활성화
│
├── backend/                   # FastAPI (Python 3.11+)
│   ├── main.py                # 앱 초기화, CORS, 라우터 등록
│   ├── routers/
│   │   └── parse.py           # POST /api/parse/zip, /api/parse/aggregate
│   ├── services/
│   │   └── file_parser.py     # ZIP 파싱, 병렬 처리, 세션 관리, 집계
│   ├── models/
│   │   └── schemas.py         # Pydantic 스키마
│   └── requirements.txt
│
└── README.md
```

---

## 구현 마일스톤

| 단계 | 내용 | 상태 |
|------|------|------|
| M1 | FastAPI 셋업 + 파일 파싱 엔진 + Next.js 프로젝트 목록 화면 | **완료** |
| M2 | ZIP 업로드 → 파일 판별 → 컬럼 매핑 → 기간 필터링 → 집계 UI | 예정 |
| M3 | 프론트: 프로젝트/계정 CRUD + 분석 모드 설정 + 중요성 필터 | 예정 |
| M4 | 구성요소 직접 정의 모드 + 수동 입력 + 증감 자동 계산 | 예정 |
| M5 | Claude API 연동: 총평 + 구성요소별 개별 사유 생성 | 예정 |
| M6 | Excel 내보내기: 요약 시트 + 계정별 조서 | 예정 |
| M7 | PwC 디자인 완성 + 전체 QA | 예정 |
