FROM mcr.microsoft.com/playwright:v1.44.1-jammy

COPY package.json package-lock.json ./
RUN npm install

COPY . .

ENTRYPOINT [ "node", "index.js" ]
