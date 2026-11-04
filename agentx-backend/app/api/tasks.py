import mimetypes

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..deps import current_user, get_services
from ..engine.workflow import ACTIVE, FINISHED, build_workflow, classify_prompt, new_task, public_task, reset_task
from ..realtime.bus import CONTROL
from ..schemas import IdsIn, NodeAction, PreviewIn, TaskIn
from ..util import new_id, now_ms, safe_name

router = APIRouter(prefix="/api", tags=["tasks"])
TEXT_EXT = {".txt", ".md", ".csv", ".json", ".log", ".tsv"}


async def _own(svc, user, task_id: str) -> dict:
    t = await svc.db.tasks.get(task_id)
    if not t or t["userId"] != user["id"]:  # same answer for "missing" and "someone else's"
        raise HTTPException(404, "Task not found")
    return t


async def _start(svc, task_id: str) -> None:
    if svc.settings.run_mode == "celery":
        from ..worker import run_task

        run_task.delay(task_id)
    else:
        await svc.orchestrator.start(task_id)


@router.post("/plan/preview")
async def preview(body: PreviewIn, user=Depends(current_user)):
    kind = classify_prompt(body.prompt)
    nodes = build_workflow(kind, {"autonomy": body.autonomy})
    return {"kind": kind, "nodes": [{k: v for k, v in n.items() if k != "params"} for n in nodes]}


@router.post("/tasks", status_code=201)
async def create_task(body: TaskIn, svc=Depends(get_services), user=Depends(current_user)):
    active = await svc.db.tasks.count({"userId": user["id"], "status": {"$in": list(ACTIVE)}})
    if active >= svc.settings.max_concurrent_tasks_per_user:
        raise HTTPException(429, f"You already have {active} tasks running. Wait for one to finish or cancel it.")
    atts = []
    for a in body.attachments:
        if a.uploadId:
            d = await svc.db.documents.get(a.uploadId)
            if not d or d["userId"] != user["id"]:
                raise HTTPException(422, f"Unknown upload: {a.name}")
        atts.append(a.model_dump())
    seq = await svc.db.next_seq("task")
    task = new_task(f"TSK-{seq}", user["id"], {**body.model_dump(exclude={"attachments"}), "attachments": atts}, await svc.policy(user["id"]))
    await svc.db.tasks.insert(task)
    await _start(svc, task["id"])
    return public_task(task, full=True)


@router.get("/tasks")
async def list_tasks(status: str | None = None, q: str | None = None, limit: int = 100, skip: int = 0, svc=Depends(get_services), user=Depends(current_user)):
    flt = {"userId": user["id"], **({"status": status} if status else {})}
    rows = await svc.db.tasks.find(flt, sort=[("createdAt", -1)], limit=min(max(limit, 1), 200), skip=max(skip, 0))
    if q:
        s = q.lower()
        rows = [t for t in rows if s in (t["title"] + t["prompt"] + t["id"]).lower()]
    return [public_task(t) for t in rows]


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, svc=Depends(get_services), user=Depends(current_user)):
    return public_task(await _own(svc, user, task_id), full=True)


@router.post("/tasks/{task_id}/cancel", status_code=202)
async def cancel(task_id: str, svc=Depends(get_services), user=Depends(current_user)):
    t = await _own(svc, user, task_id)
    if t["status"] not in ACTIVE:
        raise HTTPException(409, "Task is not running")
    await svc.bus.publish(CONTROL, {"action": "cancel", "taskId": task_id})
    if t["status"] == "queued":
        await svc.db.tasks.update(task_id, {"status": "cancelled", "finishedAt": now_ms()})
    return {"ok": True}


@router.post("/tasks/{task_id}/approve", status_code=202)
async def approve(task_id: str, body: NodeAction, svc=Depends(get_services), user=Depends(current_user)):
    return await _decide(svc, user, task_id, body.nodeId, "approve")


@router.post("/tasks/{task_id}/reject", status_code=202)
async def reject(task_id: str, body: NodeAction, svc=Depends(get_services), user=Depends(current_user)):
    return await _decide(svc, user, task_id, body.nodeId, "reject")


async def _decide(svc, user, task_id, node_id, action):
    t = await _own(svc, user, task_id)
    node = next((n for n in t["nodes"] if n["id"] == node_id), None)
    if t["status"] != "awaiting_approval" or not node or node["status"] != "awaiting_approval":
        raise HTTPException(409, "Nothing is waiting for approval on this step")
    await svc.bus.publish(CONTROL, {"action": action, "taskId": task_id, "nodeId": node_id})
    return {"ok": True}


@router.post("/tasks/{task_id}/retry", status_code=202)
async def retry(task_id: str, svc=Depends(get_services), user=Depends(current_user)):
    t = await _own(svc, user, task_id)
    if t["status"] not in FINISHED:
        raise HTTPException(409, "Task is still running")
    if await svc.db.tasks.count({"userId": user["id"], "status": {"$in": list(ACTIVE)}}) >= svc.settings.max_concurrent_tasks_per_user:
        raise HTTPException(429, "Too many tasks running")
    svc.files.remove_task(user["id"], task_id)
    fresh = reset_task(t, await svc.policy(user["id"]))
    await svc.db.tasks.replace(task_id, fresh)
    await _start(svc, task_id)
    return public_task(fresh, full=True)


async def _delete(svc, user, ids: list[str]) -> int:
    n = 0
    for i in ids:
        t = await svc.db.tasks.get(i)
        if not t or t["userId"] != user["id"]:
            continue
        if t["status"] in ACTIVE:
            raise HTTPException(409, f"{i} is still running. Cancel it first.")
        svc.files.remove_task(user["id"], i)
        await svc.memory.drop_task_documents(i)
        await svc.db.tasks.delete(i)
        n += 1
    return n


@router.delete("/tasks/{task_id}")
async def delete_one(task_id: str, svc=Depends(get_services), user=Depends(current_user)):
    if not await _delete(svc, user, [task_id]):
        raise HTTPException(404, "Task not found")
    return {"deleted": 1}


@router.post("/tasks/delete")
async def delete_many(body: IdsIn, svc=Depends(get_services), user=Depends(current_user)):
    return {"deleted": await _delete(svc, user, body.ids)}


@router.get("/tasks/{task_id}/files/{name}")
async def download(task_id: str, name: str, svc=Depends(get_services), user=Depends(current_user)):
    await _own(svc, user, task_id)
    p = svc.files.path(user["id"], task_id, name)
    if not p:
        raise HTTPException(404, "File not found")
    return FileResponse(p, filename=p.name, media_type=mimetypes.guess_type(p.name)[0] or "application/octet-stream", headers={"X-Content-Type-Options": "nosniff"})


@router.post("/uploads", status_code=201)
async def upload(file: UploadFile = File(...), svc=Depends(get_services), user=Depends(current_user)):
    """Stores text for the Researcher's documents.retrieve tool. Supported: txt, md, csv, tsv, json, log, pdf."""
    name = safe_name(file.filename or "upload")
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    limit = svc.settings.max_upload_mb * 1024 * 1024
    data = bytearray()
    while chunk := await file.read(64 * 1024):
        data += chunk
        if len(data) > limit:
            raise HTTPException(413, f"File is larger than {svc.settings.max_upload_mb} MB")
    if ext in TEXT_EXT:
        text = bytes(data).decode("utf-8", errors="replace")
    elif ext == ".pdf":
        try:
            import io

            from pypdf import PdfReader

            text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(bytes(data))).pages[:100])
        except ImportError:
            raise HTTPException(415, "PDF support is not installed on this server")
        except Exception:
            raise HTTPException(422, "Could not read this PDF")
    else:
        raise HTTPException(415, "Supported types: txt, md, csv, tsv, json, log, pdf")
    if not text.strip():
        raise HTTPException(422, "No text found in this file")
    doc = {"id": new_id("up"), "userId": user["id"], "name": name, "size": len(data), "text": text[:300_000], "createdAt": now_ms()}
    await svc.db.documents.insert(doc)
    return {"uploadId": doc["id"], "name": name, "size": len(data)}
