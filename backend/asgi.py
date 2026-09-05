from app import create_app

# Production ASGI entrypoint used by servers like uvicorn/gunicorn
app = create_app()
