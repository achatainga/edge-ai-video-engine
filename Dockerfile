FROM node:20-alpine

# Install system dependencies: FFmpeg, Fontconfig, Python3, Pip, curl, and TrueType fonts
RUN apk add --no-cache \
    curl \
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

# Download modern viral typography (Montserrat Black & Bold) for high-retention subtitles
RUN mkdir -p /usr/share/fonts/montserrat && \
    curl -sL https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Black.ttf -o /usr/share/fonts/montserrat/Montserrat-Black.ttf && \
    curl -sL https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Bold.ttf -o /usr/share/fonts/montserrat/Montserrat-Bold.ttf && \
    fc-cache -f

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
