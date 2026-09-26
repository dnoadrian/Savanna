# SHOWDOWN BAY – eigener Server (VPS, Heimserver, Cloud)
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=4242
EXPOSE 4242
# Konten, Freundeslisten und Partys bleiben hier gespeichert
VOLUME ["/app/server/data"]
CMD ["node", "server/index.js"]
