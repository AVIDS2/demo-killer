#!/usr/bin/env node
const { program } = require("commander");
const https = require("https");
const fs = require("fs");

program
  .name("mycli")
  .description("Fetch data from URLs and display it")
  .version("1.0.0");

program
  .command("fetch <url>")
  .description("Fetch data from a URL")
  .option("-o, --output <file>", "Write output to file")
  .option("-t, --timeout <ms>", "Request timeout in milliseconds")
  .option("-H, --header <header>", "Custom header (key:value)")
  .option("--raw", "Show raw response body")
  .option("--insecure", "Allow insecure SSL connections")
  .option("--retries <n>", "Number of retries on failure")
  .action((url, opts) => {
    // Unsafe: URL from args is used directly without validation
    const urlObj = new URL(url);

    const reqOpts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
    };

    if (opts.insecure) {
      reqOpts.rejectUnauthorized = false;
    }

    const req = https.request(reqOpts, (res) => {
      let data = "";

      // Unsafe: no size limit on response body
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (opts.output) {
          // Unsafe: path traversal possible via --output flag
          fs.writeFileSync(opts.output, data);
          console.log(`Written to ${opts.output}`);
        } else {
          console.log(data);
        }
        // Always exits 0 even on HTTP errors
        process.exit(0);
      });
    });

    req.on("error", (err) => {
      console.error("Request failed:", err.message);
      process.exit(0);
    });

    req.end();
  });

program
  .command("pipe")
  .description("Read from stdin and output to stdout")
  .action(() => {
    // Unsafe: reads stdin without size limit or timeout
    const input = fs.readFileSync(0, "utf-8");
    console.log(input.toUpperCase());
    process.exit(0);
  });

program.parse(process.argv);
