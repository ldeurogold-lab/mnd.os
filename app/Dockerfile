FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /data/uploads
EXPOSE 3200
CMD ["node","server.js"]
