from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import get_settings
from app.crud import create_task, delete_task, get_task, get_tasks, update_task
from app.database import Base, SessionLocal, engine, get_db, wait_for_db
from app.models import HelloWorld
from app.redis_client import check_redis_health
from app.routers.hello import router as hello_router
from app.schemas import TaskCreate, TaskResponse, TaskUpdate

settings = get_settings()


def seed_hello_world():
    """Seed the hello_world table if empty."""
    db = SessionLocal()
    try:
        existing = db.query(HelloWorld).first()
        if not existing:
            record = HelloWorld(message="Hello World from Postgres")
            db.add(record)
            db.commit()
            print("[SEED] hello_world table seeded.")
        else:
            print("[SEED] hello_world table already has data.")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(application: FastAPI):
    wait_for_db()
    Base.metadata.create_all(bind=engine)
    seed_hello_world()
    print("[APP] Tables created, app is ready!")
    yield
    print("[APP] Shutting down...")


app = FastAPI(
    title="Lam Viec 360 - Task API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(hello_router)


@app.get("/")
def root():
    return {"message": "Lam Viec 360 - Task CRUD API"}


@app.get("/health")
def health():
    """Health check endpoint for Docker and load balancers."""
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "redis": check_redis_health(),
    }


@app.get("/tasks", response_model=list[TaskResponse])
def read_tasks(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return get_tasks(db, skip=skip, limit=limit)

@app.get("/tasks/{task_id}", response_model=TaskResponse)
def read_task(task_id: int, db: Session = Depends(get_db)):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.post("/tasks", response_model=TaskResponse, status_code=201)
def create(task_in: TaskCreate, db: Session = Depends(get_db)):
    return create_task(db, task_in)

@app.put("/tasks/{task_id}", response_model=TaskResponse)
def update(task_id: int, task_in: TaskUpdate, db: Session = Depends(get_db)):
    task = update_task(db, task_id, task_in)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.delete("/tasks/{task_id}")
def delete(task_id: int, db: Session = Depends(get_db)):
    success = delete_task(db, task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"detail": "Task deleted"}
