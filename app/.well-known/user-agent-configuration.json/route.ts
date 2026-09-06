import { fromStalwart } from "../stalwart";

export const dynamic = "force-dynamic";

export const GET = () =>
  fromStalwart("/.well-known/user-agent-configuration.json");
