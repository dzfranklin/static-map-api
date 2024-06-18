FROM mcr.microsoft.com/playwright:v1.44.1-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

ENV BUILD_DIR=/app/build
ENTRYPOINT [ "node", "/app/build/index.js" ]
