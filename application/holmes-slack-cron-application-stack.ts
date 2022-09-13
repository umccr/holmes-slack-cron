import * as path from "path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import {
  HolmesSlackCronSettings,
  STACK_DESCRIPTION,
} from "../holmes-slack-cron-settings";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

/**
 * The Holmes Slack Cron is a service that regularly runs a report over Slack
 * of new fingerprints.
 */
export class HolmesSlackCronApplicationStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & HolmesSlackCronSettings
  ) {
    super(scope, id, props);

    this.templateOptions.description = STACK_DESCRIPTION;

    const slackSecret = Secret.fromSecretNameV2(
      this,
      "SlackSecret",
      "SlackApps"
    );

    const permissions = [
      "service-role/AWSLambdaBasicExecutionRole",
      "AmazonS3ReadOnlyAccess",
      "AWSCloudMapReadOnlyAccess",
    ];

    const lambdaRole = new Role(this, "Role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    permissions.map((permission) => {
      lambdaRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName(permission)
      );
    });

    const dockerImageAsset = this.addDockerAsset();

    const env: any = {
      BUCKET: props.bucket,
      SITES_CHECKSUM: props.sitesChecksum,
      CHANNEL: props.channel,
    };

    if (props.days) {
      env["DAYS"] = props.days.toString();
    }

    const func = new DockerImageFunction(this, `GroupFunction`, {
      memorySize: 2048,
      timeout: Duration.minutes(14),
      code: DockerImageCode.fromEcr(dockerImageAsset.repository, {
        tag: dockerImageAsset.assetHash,
      }),
      role: lambdaRole,
      environment: env,
    });

    const eventRule = new Rule(this, "ScheduleRule", {
      schedule: Schedule.expression(props.cron),
    });

    eventRule.addTarget(new LambdaFunction(func));

    slackSecret.grantRead(lambdaRole);
  }

  /**
   * The docker asset is the main code we are executing
   * @private
   */
  private addDockerAsset(): DockerImageAsset {
    const dockerImageFolder = path.join(__dirname, "image");

    return new DockerImageAsset(this, "DockerImage", {
      directory: dockerImageFolder,
      buildArgs: {},
    });
  }
}
