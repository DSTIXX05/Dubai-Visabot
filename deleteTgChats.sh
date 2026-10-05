#!/bin/bash

# Replace CHAT_ID with your Telegram chat ID, e.g. 123456789
CHAT_ID=6162892084
TABLE=visa-bot
REGION=eu-north-1

# Delete conversation state
aws dynamodb delete-item \
  --table-name $TABLE \
  --region $REGION \
  --key '{"pk": {"S": "USER#'$CHAT_ID'"}, "sk": {"S": "CONVERSATION#active"}}'

# Delete profile
aws dynamodb delete-item \
  --table-name $TABLE \
  --region $REGION \
  --key '{"pk": {"S": "USER#'$CHAT_ID'"}, "sk": {"S": "PROFILE"}}'
