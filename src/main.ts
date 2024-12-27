import { Application } from "https://deno.land/x/oak/mod.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

await load({ export: true });

const app = new Application();
const port = parseInt(Deno.env.get("PORT") || "3000");

// Middleware
app.use(oakCors());
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Routes will be added here

console.log(`Server running on port ${port}`);
await app.listen({ port });
