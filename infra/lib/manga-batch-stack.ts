import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import * as path from "path";

export class MangaBatchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SSM Parameter Store から OpenAI API Key を参照
    const openaiApiKey = ssm.StringParameter.valueFromLookup(
      this,
      "/manga-batch/openai-api-key"
    );

    // S3 バケット
    const bucket = new s3.Bucket(this, "MangaBucket", {
      bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    cdk.Tags.of(bucket).add("App", "manga-batch");

    // Lambda 関数
    const fn = new nodejs.NodejsFunction(this, "MangaBatchFunction", {
      functionName: "manga-batch-splitter",
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../src/handler.ts"),
      handler: "handler",
      memorySize: 1024,
      timeout: cdk.Duration.minutes(10),
      environment: {
        S3_BUCKET: bucket.bucketName,
        OPENAI_API_KEY: openaiApiKey,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
      },
    });
    cdk.Tags.of(fn).add("App", "manga-batch");

    // Lambda に S3 読み書き権限を付与
    bucket.grantReadWrite(fn);

    // Outputs
    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket for manga epub files",
    });

    new cdk.CfnOutput(this, "FunctionName", {
      value: fn.functionName,
      description: "Lambda function name",
    });

    new cdk.CfnOutput(this, "FunctionArn", {
      value: fn.functionArn,
      description: "Lambda function ARN",
    });
  }
}
