#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { MangaBatchStack } from "../lib/manga-batch-stack";

const app = new cdk.App();

new MangaBatchStack(app, "MangaBatchStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    App: "manga-batch",
  },
});
