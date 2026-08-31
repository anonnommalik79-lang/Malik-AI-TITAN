FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip git git-lfs ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/malikvideo-enhancer
COPY requirements.txt ./requirements.txt
RUN python3 -m pip install --break-system-packages -r requirements.txt
COPY app.py ./app.py
COPY install-seedvr2.sh ./install-seedvr2.sh
RUN chmod +x ./install-seedvr2.sh && mkdir -p /data/malikvideo-enhancer

VOLUME ["/data/malikvideo-enhancer"]
EXPOSE 8020

CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8020"]
