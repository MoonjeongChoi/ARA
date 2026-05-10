import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import ai, export, parse

app = FastAPI(
    title="ARA — Analytical Review Assistant API",
    description="회계감사 분석적 검토 자동화 백엔드",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse.router)
app.include_router(export.router)
app.include_router(ai.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ARA Backend"}
