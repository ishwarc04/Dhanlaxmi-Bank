import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.ml_service import model_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models on startup."""
    logger.info("Loading ML models...")
    model_service.load_models()
    if model_service.approval_available:
        logger.info("OK: Approval model ready")
    else:
        logger.warning("WARN: Approval model unavailable")
    if model_service.isolation_available:
        logger.info("OK: Isolation model ready")
    else:
        logger.warning("WARN: Isolation model unavailable")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="FinTrust — Digital Loan Assessment and Management System",
    description="Academic prototype for Dhanlaxmi Bank case study. Not affiliated with the bank.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and register routes
from app.routes.auth import router as auth_router
from app.routes.applications import router as applications_router
from app.routes.admin import router as admin_router
from app.routes.general import router as general_router

app.include_router(auth_router)
app.include_router(applications_router)
app.include_router(admin_router)
app.include_router(general_router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "models": {
            "approval": model_service.approval_available,
            "isolation": model_service.isolation_available,
        }
    }
