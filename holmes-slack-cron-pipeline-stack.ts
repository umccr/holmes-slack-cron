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
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

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
        rolePolicyStatements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: ["*"],
          }),
        ],
      }),
      crossAccountKeys: true,
    });

    const sc = "ad0e523b19164b9af4dda86c90462f6a"; // pragma: allowlist secret

    const devStage = new HolmesSlackCronBuildStage(this, "Dev", {
      env: {
        account: AWS_DEV_ACCOUNT,
        region: AWS_DEV_REGION,
      },
      bucket: "umccr-fingerprint-dev",
      // NOTE: THIS IS A UTC HOUR - SO LOOKING AT RUNNING ABOUT MIDDAY 2+10
      // NOTE: this runs only on the first day of the month in deployed dev - change when doing actual dev work
      cron: "cron(0 2 1 * ? *)",
      channel: "#arteria-dev",
      sitesChecksum: sc,
      // we look back until we find fingerprints (useful for dev)
      days: undefined,
    });

    pipeline.addStage(devStage, {});

    const prodStage = new HolmesSlackCronBuildStage(this, "Prod", {
      env: {
        account: AWS_PROD_ACCOUNT,
        region: AWS_PROD_REGION,
      },
      bucket: "umccr-fingerprint-prod",
      // NOTE: THIS IS A UTC HOUR - SO LOOKING AT RUNNING ABOUT MIDDAY 2+10
      // NOTE: it runs every day though we don't expect most days for it to discover fingerprints
      cron: "cron(0 2 * * ? *)",
      channel: "#biobots",
      sitesChecksum: sc,
      // we look back one day for fingerprints to report on
      days: 1,
    });

    pipeline.addStage(prodStage, {
      pre: [new pipelines.ManualApprovalStep("PromoteToProd")],
    });
  }
}
