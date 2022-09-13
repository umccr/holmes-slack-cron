import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { HolmesSlackCronPipelineStack } from "./holmes-slack-cron-pipeline-stack";
import { TAG_STACK_VALUE } from "./holmes-slack-cron-settings";
import { AWS_BUILD_ACCOUNT, AWS_BUILD_REGION } from "./umccr-constants";

const app = new cdk.App();

/**
 * This is the main pipeline stack that is deployed into the build
 * account and controls the build/deployment of the application.
 */
new HolmesSlackCronPipelineStack(app, "HolmesSlackCronPipelineStack", {
  // the pipeline can only be deployed to 'build' and this should only happen once
  env: {
    account: AWS_BUILD_ACCOUNT,
    region: AWS_BUILD_REGION,
  },
  tags: {
    Stack: TAG_STACK_VALUE,
  },
});
