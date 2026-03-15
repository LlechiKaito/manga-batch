"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadEpub = downloadEpub;
exports.uploadEpub = uploadEpub;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({});
async function downloadEpub(bucket, key) {
    const res = await s3.send(new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
}
async function uploadEpub(bucket, key, body) {
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/epub+zip",
    }));
    console.log(`Uploaded: s3://${bucket}/${key}`);
}
