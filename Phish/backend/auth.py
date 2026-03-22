import os
import redis
import json
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
from models import User, Role, Permission

# Configuration
SECRET_KEY = "SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 # 8 hours

class OptionalOAuth2PasswordBearer(OAuth2PasswordBearer):
    async def __call__(self, request: Request) -> Optional[str]:
        return await super().__call__(request) if request.headers.get("Authorization") else None

oauth2_scheme = OptionalOAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

# Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    from sqlalchemy import func
    # Try exact match first for performance and to handle legacy case-variant duplicates
    user = db.query(User).filter(User.username == username).first()
    if not user:
        # Fallback to case-insensitive match
        user = db.query(User).filter(func.lower(User.username) == username.lower()).first()
    if user is None:
        raise credentials_exception
    return user

async def get_user_permissions(user_id: int, db: Session):
    """Gets user permissions with Redis caching"""
    cache_key = f"user_perms:{user_id}"
    
    if redis_client:
        try:
            cached_perms = redis_client.get(cache_key)
            if cached_perms:
                return json.loads(cached_perms)
        except Exception:
            pass

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.user_role:
        return []
    
    permissions = [p.name for p in user.user_role.permissions]
    
    if redis_client:
        try:
            redis_client.setex(cache_key, 3600, json.dumps(permissions))
        except Exception:
            pass
            
    return permissions

class PermissionChecker:
    def __init__(self, required_permissions: List[str]):
        self.required_permissions = required_permissions

    async def __call__(self, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        user_perms = await get_user_permissions(user.id, db)
        
        for perm in self.required_permissions:
            if perm not in user_perms:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"У вас нет необходимого разрешения: {perm}"
                )
        return user

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_user)):
        if not user.user_role:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Пользователю не назначена роль"
            )
        
        # Admin bypass for local testing and super-admin access
        if user.user_role.name == "admin_gov":
            return user

        if user.user_role.name not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="У вас недостаточно прав для выполнения этого действия"
            )
        return user
