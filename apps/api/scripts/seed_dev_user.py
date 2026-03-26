#!/usr/bin/env python3
"""Seed a dev user for local login. Run: python scripts/seed_dev_user.py"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.core.security import hash_password
from app.models.tenancy import User, Tenant, Membership

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/etsy_platform")

def main():
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    db = Session()

    email = "etsy054667@gmail.com"
    password = "password123"
    name = "Dev User"

    user = db.query(User).filter(User.email == email).first()
    if user:
        print(f"User {email} already exists.")
        db.close()
        return

    user = User(
        email=email,
        password_hash=hash_password(password),
        name=name,
        email_verified=True,
    )
    db.add(user)
    db.flush()

    tenant = Tenant(name=f"{name}'s Organization", onboarding_completed=True)
    db.add(tenant)
    db.flush()

    membership = Membership(
        user_id=user.id,
        tenant_id=tenant.id,
        role="owner",
        invitation_status="accepted",
    )
    db.add(membership)

    db.commit()
    db.close()
    print(f"Created user {email} with password '{password}'")
    print("You can now log in.")

if __name__ == "__main__":
    main()
