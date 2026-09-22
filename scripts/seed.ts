// Seeds the visa catalogue into DynamoDB. Run with: npm run seed

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { loadConfig } from "../src/shared/config";
import { ProductRecord, pk } from "../src/shared/db/dynamo";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Placeholder prices — replace with the company's real standard pricing.
const UAE_VISAS: Array<{ type: string; price: number }> = [
  { type: "48-Hour Transit Visa", price: 30 },
  { type: "96-Hour Transit Visa", price: 50 },
  { type: "30-Day Single-Entry Tourist Visa", price: 95 },
  { type: "30-Day Multiple-Entry Tourist Visa", price: 175 },
  { type: "60-Day Single-Entry Tourist Visa", price: 250 },
  { type: "60-Day Multiple-Entry Tourist Visa", price: 450 },
  { type: "5-Year Multiple-Entry Tourist Visa", price: 650 },
  { type: "Job Exploration Visa", price: 200 },
  { type: "Business Entry Visa", price: 150 },
  { type: "Standard Employment Visa", price: 350 },
  {
    type: "5-Year Green Visa (Skilled Workers, Freelancers, Entrepreneurs)",
    price: 800,
  },
  {
    type: "10-Year Golden Visa (Investors, Talents, Researchers)",
    price: 1200,
  },
  { type: "5-Year Retirement Visa", price: 700 },
  { type: "Property Owner Residency Visa", price: 900 },
];

const products: ProductRecord[] = [
  ...UAE_VISAS.map((v) => ({
    pk: pk.product("United Arab Emirates"),
    sk: `TYPE#${v.type}`,
    destination: "United Arab Emirates",
    visaType: v.type,
    priceUsd: v.price,
    currency: "USD",
    requirements: [
      "Valid passport",
      "Passport photo",
      "Completed application form",
    ],
    processingTime: "5-7 business days",
    effectiveFrom: "2026-01-01",
  })),
  {
    pk: pk.product("Canada"),
    sk: "TYPE#tourist",
    destination: "Canada",
    visaType: "tourist",
    priceUsd: 100,
    currency: "USD",
    requirements: ["Valid passport", "Invitation letter", "Bank statement"],
    processingTime: "15-20 business days",
    effectiveFrom: "2026-01-01",
  },
  {
    pk: pk.product("United Kingdom"),
    sk: "TYPE#tourist",
    destination: "United Kingdom",
    visaType: "tourist",
    priceUsd: 130,
    currency: "USD",
    requirements: ["Valid passport", "Accommodation proof", "Bank statement"],
    processingTime: "15 working days",
    effectiveFrom: "2026-01-01",
  },
];

async function main(): Promise<void> {
  const config = loadConfig();
  console.log(
    `Seeding ${products.length} products into ${config.dynamoTable}...`,
  );

  for (const p of products) {
    await client.send(
      new PutCommand({ TableName: config.dynamoTable, Item: p }),
    );
    console.log(`  ✓ ${p.destination} (${p.visaType})`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
