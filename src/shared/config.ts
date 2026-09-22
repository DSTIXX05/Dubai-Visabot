// Environment-driven configuration. Never hardcode secrets in code.

export interface AppConfig {
  deepseekApiKey: string;
  deepseekModel: string;
  deepseekBaseUrl: string;

  whatsappVerifyToken: string;
  whatsappAccessToken: string;
  whatsappPhoneNumberId: string;
  whatsappApiVersion: string;
  whatsappBaseUrl: string;

  telegramBotToken: string;

  dynamoTable: string;
  inboundQueueUrl: string;
  outboundQueueUrl: string;

  paymentBaseUrl: string;
  conversationTtlHours: number;
  maxHistoryMessages: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    deepseekApiKey: env.DEEPSEEK_API_KEY ?? "",
    deepseekModel: env.DEEPSEEK_MODEL ?? "deepseek-chat",
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",

    whatsappVerifyToken: env.WHATSAPP_VERIFY_TOKEN ?? "",
    whatsappAccessToken: env.WHATSAPP_ACCESS_TOKEN ?? "",
    whatsappPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    whatsappApiVersion: env.WHATSAPP_API_VERSION ?? "v19.0",
    whatsappBaseUrl: env.WHATSAPP_BASE_URL ?? "https://graph.facebook.com",

    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? "",

    dynamoTable: env.DYNAMODB_TABLE ?? "visa-bot",
    inboundQueueUrl: env.INBOUND_QUEUE_URL ?? "",
    outboundQueueUrl: env.OUTBOUND_QUEUE_URL ?? "",

    paymentBaseUrl: env.PAYMENT_BASE_URL ?? "https://pay.example.com",
    conversationTtlHours: Number(env.CONVERSATION_TTL_HOURS ?? 24),
    maxHistoryMessages: Number(env.MAX_HISTORY_MESSAGES ?? 10),
  };
}
