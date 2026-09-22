#!/usr/bin/env bash
# Deploy visa-bot to AWS using secrets from .env.
# Keeps secrets out of shell history and prevents copy-paste placeholder errors.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Error: .env not found. Run 'cp .env.example .env' and fill in your secrets." >&2
  exit 1
fi

# Load KEY=VALUE lines from .env into the shell.
set -a
# shellcheck disable=SC1091
source .env
set +a

# Require the secrets we deploy with.
: "${DEEPSEEK_API_KEY:?Set DEEPSEEK_API_KEY in .env}"
: "${TELEGRAM_BOT_TOKEN:?Set TELEGRAM_BOT_TOKEN in .env}"
: "${WHATSAPP_VERIFY_TOKEN:?Set WHATSAPP_VERIFY_TOKEN in .env}"
: "${WHATSAPP_ACCESS_TOKEN:?Set WHATSAPP_ACCESS_TOKEN in .env}"
: "${WHATSAPP_PHONE_NUMBER_ID:?Set WHATSAPP_PHONE_NUMBER_ID in .env}"

echo "Deploying with secrets from .env:"
echo "  DeepSeek key     : ${DEEPSEEK_API_KEY:0:6}...${DEEPSEEK_API_KEY: -4}"
echo "  Telegram token   : ${TELEGRAM_BOT_TOKEN:0:6}...${TELEGRAM_BOT_TOKEN: -4}"
echo "  Verify token     : ${WHATSAPP_VERIFY_TOKEN}"
echo "  Access token     : ${WHATSAPP_ACCESS_TOKEN:0:6}...${WHATSAPP_ACCESS_TOKEN: -4}"
echo "  Phone number ID  : ${WHATSAPP_PHONE_NUMBER_ID}"

sam deploy \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "DeepSeekApiKey=${DEEPSEEK_API_KEY}" \
    "TelegramBotToken=${TELEGRAM_BOT_TOKEN}" \
    "WhatsAppVerifyToken=${WHATSAPP_VERIFY_TOKEN}" \
    "WhatsAppAccessToken=${WHATSAPP_ACCESS_TOKEN}" \
    "WhatsAppPhoneNumberId=${WHATSAPP_PHONE_NUMBER_ID}" \
    "PaymentBaseUrl=${PAYMENT_BASE_URL:-https://pay.example.com}"
