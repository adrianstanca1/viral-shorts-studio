FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-venv fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-whiteboard.txt ./
RUN python3 -m venv /opt/whiteboard && /opt/whiteboard/bin/pip install --no-cache-dir -r requirements-whiteboard.txt
RUN python3 -m venv /opt/piper && /opt/piper/bin/pip install --no-cache-dir piper-tts==1.8.0 \
 && mkdir -p /opt/piper-voices \
 && /opt/piper/bin/python -m piper.download_voices --download-dir /opt/piper-voices en_US-lessac-medium fr_FR-siwis-medium es_ES-sharvard-medium it_IT-serena-medium de_DE-thorsten-medium ro_RO-mihai-medium
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY app ./app
COPY python ./python
RUN mkdir -p /app/data/queue /app/data/projects /app/data/assets /app/data/renders && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=3010 DATA_DIR=/app/data PIPER_BIN=/opt/piper/bin/piper \
 PIPER_MODEL_EN=/opt/piper-voices/en_US-lessac-medium.onnx \
 PIPER_MODEL_FR=/opt/piper-voices/fr_FR-siwis-medium.onnx \
 PIPER_MODEL_ES=/opt/piper-voices/es_ES-sharvard-medium.onnx \
 PIPER_MODEL_IT=/opt/piper-voices/it_IT-serena-medium.onnx \
 PIPER_MODEL_DE=/opt/piper-voices/de_DE-thorsten-medium.onnx \
 PIPER_MODEL_RO=/opt/piper-voices/ro_RO-mihai-medium.onnx
EXPOSE 3010
CMD ["npm","start"]
