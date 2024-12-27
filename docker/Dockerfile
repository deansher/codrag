FROM denoland/deno:1.40.2

WORKDIR /app

COPY . .

RUN deno cache src/main.ts

CMD ["deno", "task", "start"]
