const express = require("express");
const client = require("prom-client");
const app = express();
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});
app.get("/health", (req, res) => {
  res.json({ status: "ok", db: process.env.DATABASE_URL, key: process.env.API_KEY });
});
app.listen(9090);
