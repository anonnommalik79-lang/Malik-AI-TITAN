FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/malikvideo-worker
COPY requirements.txt ./requirements.txt
RUN python -m pip install -r requirements.txt
COPY app.py ./app.py

RUN mkdir -p /data/malikvideo
VOLUME ["/data/malikvideo"]
EXPOSE 8010

# This recommended image needs no GPU. H3 and SeedVR2 live in independent GPU pools.
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8010"]
