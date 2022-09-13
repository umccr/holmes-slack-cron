import { CfnOutput, Stage, StageProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  HolmesSlackCronSettings,
  TAG_STACK_VALUE,
} from "./holmes-slack-cron-settings";
import { HolmesSlackCronApplicationStack } from "./application/holmes-slack-cron-application-stack";

export class HolmesSlackCronBuildStage extends Stage {
  constructor(
    scope: Construct,
    id: string,
    props: StageProps & HolmesSlackCronSettings
  ) {
    super(scope, id, props);

    const stack = new HolmesSlackCronApplicationStack(
      this,
      "HolmesSlackCron",
      props
    );

    Tags.of(stack).add("Stack", TAG_STACK_VALUE);
  }
}
