FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git git-lfs ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/malikvideo-worker
COPY requirements.txt ./requirements.txt
RUN python3 -m pip install --break-system-packages -r requirements.txt
COPY app.py ./app.py
COPY install-seedvr2.sh ./install-seedvr2.sh

RUN mkdir -p /data/malikvideo
VOLUME ["/data/malikvideo"]
EXPOSE 8010

CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8010"]
