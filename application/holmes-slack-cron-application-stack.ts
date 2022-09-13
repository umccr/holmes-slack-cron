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

    // we sometimes need to execute tasks in a VPC context
    //const vpc = Vpc.fromLookup(this, "MainVpc", {
    //  vpcName: "main-vpc",
    //});

    const dockerImageAsset = this.addDockerAsset();

    const func = new DockerImageFunction(this, `GroupFunction`, {
      memorySize: 2048,
      timeout: Duration.minutes(14),
      code: DockerImageCode.fromEcr(dockerImageAsset.repository, {
        tag: dockerImageAsset.assetHash,
      }),
      environment: {
        BUCKET: "",
        DAYS: "1",
        SITES_CHECKSUM: "",
        CHANNEL: "",
      },
    });

    const eventRule = new Rule(this, "ScheduleRule", {
      schedule: Schedule.cron({ minute: "0", hour: "1" }),
    });

    eventRule.addTarget(new LambdaFunction(func));

    /*icaSecret.grantRead(checkStateMachine.taskRole);
    icaSecret.grantRead(extractStateMachine.taskRole);
    icaSecret.grantRead(differenceStateMachine.taskRole);
    icaSecret.grantRead(differenceThenExtractStateMachine.taskRole);
    icaSecret.grantRead(differenceThenExtractStateMachine.lambdaTaskRole);

    fingerprintBucket.grantRead(checkStateMachine.taskRole);
    fingerprintBucket.grantRead(differenceStateMachine.taskRole);
    fingerprintBucket.grantReadWrite(extractStateMachine.taskRole);
    fingerprintBucket.grantReadWrite(
      differenceThenExtractStateMachine.taskRole
    );
    fingerprintBucket.grantReadWrite(
      differenceThenExtractStateMachine.lambdaTaskRole
    ); */
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
