from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.scan import router as scan_router
from app.api.v1.trends import router as trends_router
from app.api.v1.schedule import router as schedule_router
from app.api.v1.reports import router as reports_router
from app.api.v1.posts import router as posts_router
from app.api.v1.publish import router as publish_router

v1_router = APIRouter()
v1_router.include_router(auth_router, prefix="/auth", tags=["auth"])
v1_router.include_router(scan_router, prefix="/scan", tags=["scan"])
v1_router.include_router(trends_router, prefix="/trends", tags=["trends"])
v1_router.include_router(schedule_router, prefix="/scan/schedule", tags=["schedule"])
v1_router.include_router(reports_router, prefix="/reports", tags=["reports"])
v1_router.include_router(posts_router, prefix="/posts", tags=["posts"])
v1_router.include_router(publish_router, prefix="/publish", tags=["publish"])
