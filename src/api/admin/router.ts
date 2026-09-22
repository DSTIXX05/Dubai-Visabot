// Admin API router — shared by the Lambda handler and the local dev server.
// Not Meta-facing; used to manage the catalogue, inspect applications, and test sends.

import { AppConfig } from "../../shared/config";
import {
  deleteProduct,
  listApplications,
  listProducts,
  ProductRecord,
  pk,
  putProduct,
} from "../../shared/db/dynamo";
import { sendTextMessage } from "../../shared/whatsapp/client";

export interface AdminResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const json = (statusCode: number, data: unknown): AdminResponse => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export async function routeAdmin(
  method: string,
  rawPath: string,
  body: unknown,
  config: AppConfig,
): Promise<AdminResponse> {
  const path = rawPath.split("?")[0]; // strip query string

  if (method === "GET" && path === "/health") {
    return json(200, { ok: true });
  }

  if (method === "GET" && path === "/products") {
    const products = await listProducts(config.dynamoTable);
    return json(200, products);
  }

  if (method === "POST" && path === "/products") {
    const p = body as Partial<ProductRecord>;
    if (!p.destination || !p.visaType) {
      return json(400, { error: "destination and visaType are required" });
    }
    const record: ProductRecord = {
      pk: pk.product(p.destination),
      sk: `TYPE#${p.visaType}`,
      destination: p.destination,
      visaType: p.visaType,
      priceUsd: p.priceUsd ?? 0,
      currency: p.currency ?? "USD",
      requirements: p.requirements ?? [],
      processingTime: p.processingTime ?? "",
      effectiveFrom: p.effectiveFrom ?? new Date().toISOString(),
      effectiveTo: p.effectiveTo,
    };
    await putProduct(record, config.dynamoTable);
    return json(201, record);
  }

  const productDeleteMatch = path.match(/^\/products\/([^/]+)\/([^/]+)$/);
  if (method === "DELETE" && productDeleteMatch) {
    const destination = decodeURIComponent(productDeleteMatch[1]);
    const visaType = decodeURIComponent(productDeleteMatch[2]);
    await deleteProduct(destination, visaType, config.dynamoTable);
    return json(200, { deleted: { destination, visaType } });
  }

  if (method === "GET" && path === "/applications") {
    const applications = await listApplications(config.dynamoTable);
    return json(200, applications);
  }

  const appMatch = path.match(/^\/applications\/([^/]+)$/);
  if (method === "GET" && appMatch) {
    // Admin lookup by id across users is a scan; keep it simple for now.
    const applications = await listApplications(config.dynamoTable);
    const found = applications.find((a) => a.applicationId === appMatch[1]);
    return found ? json(200, found) : json(404, { error: "not found" });
  }

  if (method === "POST" && path === "/messages") {
    const { to, text } = body as { to?: string; text?: string };
    if (!to || !text) {
      return json(400, { error: "to and text are required" });
    }
    const res = await sendTextMessage({ to, text }, config);
    return json(200, res);
  }

  return json(404, { error: "route not found" });
}
