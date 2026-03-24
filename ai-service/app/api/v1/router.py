from fastapi import APIRouter

from app.api.v1.scan import router as scan_router
from app.api.v1.trends import router as trends_router
from app.api.v1.schedule import router as schedule_router

v1_router = APIRouter()
v1_router.include_router(scan_router, prefix="/scan", tags=["scan"])
v1_router.include_router(trends_router, prefix="/trends", tags=["trends"])
v1_router.include_router(schedule_router, prefix="/scan/schedule", tags=["schedule"])
