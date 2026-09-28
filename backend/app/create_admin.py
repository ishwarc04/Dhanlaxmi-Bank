"""
Secure setup command to provision the initial admin user.
Usage: python -m app.create_admin
"""
import sys
import getpass
from app.database import engine, SessionLocal, Base
from app.models import User, UserRole, AuditLog
from app.auth import hash_password


def create_admin():
    # Create all tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if admin already exists
        existing = db.query(User).filter(User.role == UserRole.ADMIN).first()
        if existing:
            print(f"Admin already exists: {existing.email}")
            confirm = input("Create another admin? (y/N): ").strip().lower()
            if confirm != "y":
                print("Aborted.")
                return

        print("\n--- Create Admin User ---")
        email = input("Email: ").strip()
        if not email:
            print("Email required.")
            sys.exit(1)

        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            print(f"Email {email} is already registered.")
            sys.exit(1)

        full_name = input("Full Name: ").strip()
        if not full_name:
            print("Full name required.")
            sys.exit(1)

        password = getpass.getpass("Password (min 8 chars): ")
        if len(password) < 8:
            print("Password must be at least 8 characters.")
            sys.exit(1)

        confirm_password = getpass.getpass("Confirm Password: ")
        if password != confirm_password:
            print("Passwords do not match.")
            sys.exit(1)

        user = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role=UserRole.ADMIN,
        )
        db.add(user)
        db.flush()

        audit = AuditLog(
            user_id=user.id,
            action="admin_created",
            entity_type="user",
            entity_id=user.id,
            details={"method": "setup_command"},
        )
        db.add(audit)
        db.commit()

        print(f"Admin user created: {email} (ID: {user.id})")
    finally:
        db.close()


if __name__ == "__main__":
    create_admin()
