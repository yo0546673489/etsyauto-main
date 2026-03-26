"""
Metrics Endpoint
Exposes Prometheus metrics for scraping
"""
from fastapi import APIRouter, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

router = APIRouter()


@router.get("/metrics", tags=["Observability"])
async def metrics():
    """
    Prometheus metrics endpoint
    
    Returns metrics in Prometheus text format for scraping
    """
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )


@router.get("/health", tags=["Observability"])
async def health():
    """
    Health check endpoint
    
    Returns 200 OK if service is healthy
    """
    return {
        "status": "healthy",
        "service": "etsy-automation-api",
        "version": "1.0.0"
    }


@router.get("/ready", tags=["Observability"])
async def readiness():
    """
    Readiness check endpoint
    
    Returns 200 OK if service is ready to accept traffic
    """
    # TODO: Add database connectivity check
    # TODO: Add Redis connectivity check
    return {
        "status": "ready",
        "service": "etsy-automation-api"
    }
