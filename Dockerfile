FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY app ./app
RUN mkdir -p /app/data/queue /app/data/projects /app/data/assets /app/data/renders && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=3010 DATA_DIR=/app/data
EXPOSE 3010
CMD ["npm","start"]
