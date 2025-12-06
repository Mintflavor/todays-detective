from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import scenarios
import os

app = FastAPI()

# CORS Configuration
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scenarios.router, prefix="/scenarios", tags=["Scenarios"])

@app.get("/")
async def root():
    return {"message": "Today's Detective Backend is Running"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
