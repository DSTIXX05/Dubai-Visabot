// Admin API Lambda handler (API Gateway HTTP API, payload v2).

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { loadConfig } from "../../shared/config";
import { routeAdmin } from "./router";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const config = loadConfig();
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;
  const body = event.body ? JSON.parse(event.body) : undefined;

  const res = await routeAdmin(method, path, body, config);

  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body,
  };
}
