FROM node:20-alpine

# Install system dependencies: FFmpeg, Fontconfig, Python3, Pip, and rich TrueType fonts for video subtitles
RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    python3 \
    py3-pip \
    font-noto \
    font-noto-cjk \
    font-noto-extra \
    ttf-dejavu

# Install edge-tts (100% free neural text-to-speech with auto-subtitles)
RUN pip install --no-cache-dir --break-system-packages edge-tts

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
