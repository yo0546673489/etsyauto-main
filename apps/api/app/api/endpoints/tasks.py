"""
Task Status API Endpoints
Provides Celery task status polling for sync feedback
"""
from fastapi import APIRouter, Depends
from app.api.dependencies import get_user_context, UserContext
from app.worker.celery_app import celery_app

router = APIRouter()


@router.get("/{task_id}/status", tags=["Tasks"])
async def get_task_status(
    task_id: str,
    context: UserContext = Depends(get_user_context),
):
    """
    Poll the status of a background task (e.g. order sync, product sync).
    Returns state, progress info, and result when complete.
    """
    result = celery_app.AsyncResult(task_id)

    response = {
        "task_id": task_id,
        "state": result.state,
        "ready": result.ready(),
    }

    if result.ready():
        if result.successful():
            response["result"] = result.result
            response["status"] = "completed"
        else:
            response["status"] = "failed"
            response["error"] = str(result.result) if result.result else "Task failed"
    elif result.state == "PROGRESS":
        response["status"] = "in_progress"
        response["progress"] = result.info if isinstance(result.info, dict) else {}
    elif result.state == "PENDING":
        response["status"] = "pending"
    else:
        response["status"] = result.state.lower()

    return response
