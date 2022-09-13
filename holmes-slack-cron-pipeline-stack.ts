import { pipelines, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
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
        rolePolicyStatements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: ["*"],
            //conditions: {
            //  StringEquals: {
            //    "iam:ResourceTag/aws-cdk:bootstrap-role": "lookup",
            //  },
            //},
          }),
        ],
      }),
      codeBuildDefaults: {
        // we need to give the codebuild engines permissions to assume a role in DEV - in order that they
        // can invoke the tests - we don't know the name of the role yet (as it is built by CDK) - so we
        // are quite permissive (it is limited to one non-prod account though)
        rolePolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [`arn:aws:iam::${AWS_DEV_ACCOUNT}:role/*`],
          }),
        ],
      },
      crossAccountKeys: true,
    });

    const devStage = new HolmesSlackCronBuildStage(this, "Dev", {
      env: {
        account: AWS_DEV_ACCOUNT,
        region: AWS_DEV_REGION,
      },
      bucket: "umccr-fingerprint-dev",
    });

    pipeline.addStage(devStage, {});

    const prodStage = new HolmesSlackCronBuildStage(this, "Prod", {
      env: {
        account: AWS_PROD_ACCOUNT,
        region: AWS_PROD_REGION,
      },
      bucket: "umccr-fingerprint-prod",
    });

    pipeline.addStage(prodStage, {
      pre: [new pipelines.ManualApprovalStep("PromoteToProd")],
    });
  }
}
