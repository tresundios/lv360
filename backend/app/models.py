from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class HelloWorld(Base):
    __tablename__ = "hello_world"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    message = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
