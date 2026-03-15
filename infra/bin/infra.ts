#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { MangaBatchStack } from "../lib/manga-batch-stack";

const app = new cdk.App();

new MangaBatchStack(app, "MangaBatchStack", {
  tags: {
    App: "manga-batch",
  },
});
