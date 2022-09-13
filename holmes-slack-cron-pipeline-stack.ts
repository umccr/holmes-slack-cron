import { pipelines, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { STACK_DESCRIPTION } from "./holmes-slack-cron-settings";
import {
  AWS_DEV_ACCOUNT,
  AWS_DEV_REGION,
  AWS_PROD_ACCOUNT,
  AWS_PROD_REGION,
} from "./umccr-constants";
import { HolmesSlackCronBuildStage } from "./holmes-slack-cron-build-stage";

/**
 * Stack to hold the self mutating pipeline, and all the relevant settings for deployments
 */
export class HolmesSlackCronPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.templateOptions.description = STACK_DESCRIPTION;

    // these are *build* parameters that we either want to re-use across lots of stacks, or are
    // 'sensitive' enough we don't want them checked into Git - but not sensitive enough to record as a Secret
    const codeStarArn = StringParameter.valueFromLookup(
      this,
      "codestar_github_arn"
    );

    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      // should normally be commented out - only use when debugging pipeline itself
      // selfMutation: false,
      // turned on because our stack makes docker assets
      dockerEnabledForSynth: true,
      dockerEnabledForSelfMutation: true,
      synth: new pipelines.CodeBuildStep("Synth", {
        // Use a connection created using the AWS console to authenticate to GitHub
        // Other sources are available.
        input: pipelines.CodePipelineSource.connection(
          "umccr/holmes-slack-cron",
          "main",
          {
            connectionArn: codeStarArn,
          }
        ),
        env: {},
        commands: [
          "npm ci",
          // our cdk is configured to use ts-node - so we don't need any build step - just synth
          "npx cdk synth",
        ],
      }),
      crossAccountKeys: true,
    });

    const devStage = new HolmesSlackCronBuildStage(this, "Dev", {
      env: {
        account: AWS_DEV_ACCOUNT,
        region: AWS_DEV_REGION,
      },
      bucket: "umccr-fingerprint-dev",
      // NOTE THIS IS A UTC HOUR - SO LOOKING AT RUNNING ABOUT MIDDAY 2+10
      cron: "0/15 * * * ? *",
    });

    pipeline.addStage(devStage, {});

    const prodStage = new HolmesSlackCronBuildStage(this, "Prod", {
      env: {
        account: AWS_PROD_ACCOUNT,
        region: AWS_PROD_REGION,
      },
      bucket: "umccr-fingerprint-prod",
      // NOTE THIS IS A UTC HOUR - SO LOOKING AT RUNNING ABOUT MIDDAY 2+10
      cron: "0 2 * * ? *",
    });

    pipeline.addStage(prodStage, {
      pre: [new pipelines.ManualApprovalStep("PromoteToProd")],
    });
  }
}
