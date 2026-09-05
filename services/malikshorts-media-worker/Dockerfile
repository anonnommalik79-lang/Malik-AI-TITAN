FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/malikshorts-media-worker
COPY requirements.txt ./requirements.txt
RUN python -m pip install -r requirements.txt
COPY worker.py ./worker.py

CMD ["python", "worker.py"]
