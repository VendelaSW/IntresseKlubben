from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# pool_pre_ping: testar connections innan de återanvänds. Viktigt i en
# serverless-miljö (Vercel Functions) där en connection annars kan ha
# blivit stängd mellan två anrop.
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
