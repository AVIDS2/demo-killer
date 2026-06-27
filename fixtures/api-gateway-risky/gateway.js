const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const app = express();
app.use("/api", createProxyMiddleware({ target: "http://backend:3000", changeOrigin: true }));
app.listen(8080);
