const { Pool } = require("pg");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({});

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = record.s3.object.key;

    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await response.Body.transformToString();
    const data = JSON.parse(body);

    for (const item of data.items) {
      await pool.query(
        "INSERT INTO events (type, payload, created_at) VALUES ($1, $2, NOW())",
        [item.type, JSON.stringify(item)]
      );
    }
  }

  return { statusCode: 200, body: "OK" };
};
