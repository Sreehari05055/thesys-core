FROM python:3.11-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg \
        libgl1 libglib2.0-0 libgomp1 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci

COPY backend backend
COPY frontend frontend

ENV HOST=0.0.0.0
EXPOSE 5000 8000

CMD python backend/main.py --host 0.0.0.0 --port 8000 & \
    cd frontend && HOST=0.0.0.0 PORT=5000 exec npm run dev
