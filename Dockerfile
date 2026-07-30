FROM node:22-slim
WORKDIR /app

# تثبيت pnpm
RUN npm install -g pnpm

# نسخ ملفات المشروع
COPY . .

# تثبيت الاعتماديات
RUN pnpm install --frozen-lockfile

# مجلد قاعدة البيانات
ENV DATA_DIR=/data
RUN mkdir -p /data

CMD ["pnpm", "--filter", "@workspace/telegram-bot", "run", "start"]
