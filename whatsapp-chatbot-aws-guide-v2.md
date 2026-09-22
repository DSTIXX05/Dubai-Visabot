## WhatsApp Chatbot on AWS - Implementation Guide

- [WhatsApp Chatbot on AWS — Implementation Guide](file:///home/claude/toPdfViaTempFile88-0.html#whatsapp-chatbot-on-aws-implementation-guide)

- [Overview](file:///home/claude/toPdfViaTempFile88-0.html#overview)

- [1. Understanding the System](file:///home/claude/toPdfViaTempFile88-0.html#understanding-the-system)

- [2. Define the Product Before Choosing Infrastructure](file:///home/claude/toPdfViaTempFile88-0.html#define-the-product-before-choosing-infrastructure)

- [3. Traditional Backend Architecture](file:///home/claude/toPdfViaTempFile88-0.html#traditional-backend-architecture)

- [4. Serverless Backend Architecture](file:///home/claude/toPdfViaTempFile88-0.html#serverless-backend-architecture)

- [5. Traditional vs. Serverless — Head to Head](file:///home/claude/toPdfViaTempFile88-0.html#traditional-vs.-serverless-head-to-head)

- [6. Recommended Hybrid Option](file:///home/claude/toPdfViaTempFile88-0.html#recommended-hybrid-option)

- [7. AI Integration That Stays Trustworthy](file:///home/claude/toPdfViaTempFile88-0.html#ai-integration-that-stays-trustworthy)

- [8. Security, Privacy, and Reliability](file:///home/claude/toPdfViaTempFile88-0.html#security-privacy-and-reliability)

- [9. Testing, Monitoring, and Deployment](file:///home/claude/toPdfViaTempFile88-0.html#testing-monitoring-and-deployment)

- [10. Delivery Roadmap](file:///home/claude/toPdfViaTempFile88-0.html#delivery-roadmap)

- [11. Build Checklist](file:///home/claude/toPdfViaTempFile88-0.html#build-checklist)

- [12. Final Decision Summary](file:///home/claude/toPdfViaTempFile88-0.html#final-decision-summary)

- [My Two Cents](file:///home/claude/toPdfViaTempFile88-0.html#my-two-cents)

## WhatsApp Chatbot on AWS — Implementation Guide

Cleaned-up, reformatted edition with added commentary

## Overview

This guide explains how to build a WhatsApp chatbot that can answer questions, maintain conversation state, call business services, use an AI model safely, accept documents, and support production operations. It presents two viable AWS architectures and explains where each one is

easier.

Main conclusion: For a new chatbot with unpredictable or modest traffic, a serverless design is usually easier to operate and cheaper to begin with. A traditional backend is often easier for developers to understand, run locally, and debug as one application. A hybrid design can combine both strengths.

| Decision | Best starting point | Why |
| --- | --- | --- |
| Fast prototype with one familiar | Traditional backend | Straightforward request flow and |
| web app |   | familiar framework tooling |
| Low operations and automatic | Serverless | AWS manages servers and scales |
| scaling |   | individual functions |
| Existing Dockerized application | Traditional on ECS Fargate | Reuse the container without |
|   |   | redesigning it into functions |
| New event-driven product | Serverless | Natural fit for webhooks, queues, |
|   |   | short jobs, and pay-per-use |

Scope covered:

\- WhatsApp Cloud API integration through Meta webhooks - A domain-specific

catalogue, assessments, applications, and status checks - Optional large language model for intent extraction and natural responses - Private document uploads, async work, security, CI/CD, monitoring, and testing

Examples use Python, but the architecture works equally well with Node.js, Java, Go, or another


backend language.

## 1. Understanding the System

WhatsApp is the conversation channel, not the backend. Meta sends an HTTPS webhook when a message arrives. The backend validates the event, decides what action is needed, reads or updates authoritative data, and uses the WhatsApp Cloud API to send a reply.

```
WhatsApp user → Meta Cloud API → AWS webhook → Application logic → Data & services → Reply
```

Core design rule: Keep facts and actions in application code and databases. Use an AI model only to understand language, extract structured fields, choose from permitted tools, or rewrite verified results. The model should not invent prices, requirements, eligibility rules, payment outcomes, or application status.

Example: > User: “I am Nigerian and want to visit Australia for two weeks.”

Model output:

```
{
"intent": "visa_enquiry",
"nationality": "Nigeria",
"destination": "Australia",
"purpose": "tourism",
"duration": "2 weeks"
}
```

Backend action: look up verified products/requirements — the model never makes this part up.

## Shared building blocks

| Component | Responsibility |
| --- | --- |
| Meta WhatsApp Cloud API | Receives user messages, delivers webhook events, |
|   | sends approved replies/templates |
| Webhook endpoint | Public HTTPS endpoint for Meta verification and |
|   | message events |
| Conversation engine | Tracks what the user is doing and what info is missing |
| Business service | Owns catalogue, pricing, rules, applications, status |
|   | changes |
| Database | Stores users, sessions, applications, audit records, |
|   | idempotency keys |
| Object storage | Stores uploaded documents privately; DB stores |
|   | metadata/references |
| Queue and worker | Handles slow or retryable work outside the webhook |
|   | request |
| AI service | Extracts intent/fields or drafts language from verified |
|   | backend results |
| Operations layer | Logs, metrics, alarms, secrets, deployment, backups, |
|   | access controls |


## 2. Define the Product Before Choosing Infrastructure

Write the first release as a small set of user journeys. This avoids building queues, AI, document processing, and complex databases before the basic WhatsApp loop even works.

Recommended MVP journeys: 1. Greeting and help — bot introduces itself and lists capabilities

2. Enquiry — user asks about a destination, product, requirement, or price 3. Assessment — bot collects a fixed set of answers, returns a rule-based outcome or creates a review request 4. Application — user starts an application and can check its status 5. Human handoff — bot records the issue and transfers/flags it for an agent

## Data contracts

## Normalized incoming message

```
{
"event_id": "meta-message-id",
"user_id": "whatsapp-phone-id",
"type": "text",
"text": "I want to visit Australia",
"received_at": "ISO-8601 timestamp"
}
```

## Safe backend response

```
{
"status": "ok",
"intent": "visa_enquiry",
"facts": {"destination": "Australia", "currency": "USD"},
"reply_text": "...",
"next_state": "AWAITING_PURPOSE"
}
```

## Minimum entities

| Entity User Conversation Message Product/visa Application Document Job |   |   | Important fields user_id, phone identifier, language, consent, created_at conversation_id, user_id, state, context, updated_at, expires_at event_id, direction, type, delivery state, timestamp destination, type, verified requirements, price, effective dates application_id, user_id, stage, answers, assigned reviewer, timestamps document_id, application_id, S3 key, type, scan status, retention date job_id, type, status, attempts, failure reason, correlation_id |
| --- | --- | --- | --- |

## 3. Traditional Backend Architecture


A continuously available web application — package a FastAPI, Flask, Django, Express, or NestJS service as a Docker container and run it on Amazon ECS with AWS Fargate. A simpler learning version can run on one EC2 instance, but that creates more server maintenance and weaker availability.

WhatsApp → Meta API → Load balancer → ECS Fargate app → RDS/DynamoDB → Meta reply

Slow work leaves the request path: the web app places a job on SQS, a worker service or Lambda processes it, failed jobs move to a dead-letter queue. Documents go to a private S3 bucket.

## Suggested AWS components

| Need | AWS service | Notes |
| --- | --- | --- |
| Public HTTPS endpoint | Application Load Balancer | Routes /webhook and health checks |
|   |   | to the container service |
| Application runtime | ECS Fargate | Runs Docker containers without |
|   |   | managing EC2 hosts |
| Relational data | Amazon RDS (PostgreSQL) | Good for applications, products, |
|   |   | relationships, transactions |
| Fast session state | DynamoDB or ElastiCache | DynamoDB reduces ops; Redis |
|   |   | supports fast ephemeral state |
| Documents | Amazon S3 | Private bucket, encryption, lifecycle |
|   |   | rules, malware scanning |
| Background work | SQS + worker | Retries, buffering, dead-letter |
|   |   | queue |
| Secrets | Secrets Manager | Meta token, DB credentials, model |
|   |   | API keys |
| Observability | CloudWatch | Container logs, metrics, |
|   |   | dashboards, alarms |

## How to build it

- 1. Create a Meta developer app, add WhatsApp, obtain test resources, define a verification token

- 2. Build one web app with GET /webhook (verification), POST /webhook (events), POST /messages (internal testing), GET /health

- 3. Validate webhook signatures, normalize events, deduplicate by Meta message ID, acknowledge quickly

- 4. Add business modules for catalogue, assessments, applications, documents, status

- 5. Add PostgreSQL migrations and a conversation state table — keep the initial state machine explicit

- 6. Add an outbound WhatsApp client with timeouts, safe retries, delivery-status handling

- 7. Dockerize; push images to ECR; deploy to ECS Fargate behind an ALB

- 8. Add SQS workers for document analysis or other slow work

- 9. Add CI/CD, alarms, backups, access controls, production Meta configuration

## Project structure

app/

main.py config.py

\# routes and startup

\# environment settings


```
whatsapp/
webhook.py # verification and event handling
client.py # send replies and templates
schemas.py # Meta payload models
conversations/
engine.py # explicit state transitions
domain/
catalogue.py
assessments.py
applications.py
ai/
service.py # structured model calls only
prompts.py
workers/
document_worker.py
db/
models.py
migrations/
tests/
Dockerfile
infra/terraform/
.github/workflows/
```

## Request handling pattern

- Return success promptly so Meta doesn’t treat a valid delivery as failed

- Use event_id as an idempotency key — process duplicate deliveries once

- Load conversation state, route the intent, execute only permitted business actions, persist the transition

- Send the response via the Meta API; store delivery IDs/status without logging sensitive content

## Strengths and limitations

|   |   | Strengths |   |   |   | One application is easy to trace locally |   | Limitations Containers/DBs need capacity, patching, health checks, deploy care |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|   |   | familiar natural environments |   |   |   |   | Frameworks, ORMs, migrations, integration tests are Longer processing and persistent connections are Easy to move between cloud providers or local | Service normally incurs cost while idle Scaling a monolith can scale more code than the busy feature needs A single service can become tightly coupled if boundaries are ignored |

Choose this when: the team knows web frameworks/Docker better than event-driven AWS services, the product needs relational workflows/complex queries/long requests, there’s already a Dockerized backend to extend, or traffic is steady enough that always-on compute makes sense.

## 4. Serverless Backend Architecture

Splits the system into managed, event-driven parts. API Gateway exposes the webhook, Lambda validates/routes messages, DynamoDB stores state, S3 stores documents, SQS buffers slow jobs, another Lambda processes jobs. Amazon Bedrock (or an external model) provides language understanding.


## Suggested AWS components

| Need AWS service Notes Public HTTPS endpoint API Gateway (HTTP API) Routes verification and webhook requests to Lambda Short application logic AWS Lambda Webhook handler, router, business functions, workers Users and state DynamoDB Low-ops key-value/document storage with TTL support Documents S3 Private objects, short-lived presigned URLs where appropriate Background work SQS + Lambda Event source mapping, retry policy, partial batch handling, DLQ AI Bedrock or external API Structured outputs; verified |
| --- |
| backend data stays authoritative |
| Secrets Secrets Manager / Parameter Store Never hardcode tokens Observability CloudWatch + X-Ray Logs, metrics, tracing, dashboards, alarms |

## How to build it

- 1. Create the Meta test app and a webhook verification token

- 2. Create API Gateway routes for GET /webhook and POST /webhook

- 3. Write a small webhook Lambda that verifies Meta, validates signatures, deduplicates messages, normalizes the payload

- 4. Store user/conversation records in DynamoDB with explicit states and conditional writes to prevent conflicting updates

- 5. Create a business Lambda or shared domain package for verified catalogue/application actions

- 6. Create an outbound sender module/Lambda for Meta replies, with controlled retries and delivery tracking

- 7. Place slow jobs on SQS; configure a worker Lambda, visibility timeout, retry limits, DLQ

- 8. Store uploads in S3 with encryption, restricted IAM, lifecycle rules, scan status metadata

- 9. Provision the stack with Terraform or AWS SAM, deploy through CI/CD

## Project structure

```
services/
webhook_handler/handler.py
conversation_router/handler.py
assessment_worker/handler.py
outbound_sender/handler.py
shared/
domain/
whatsapp_client/
ai_client/
schemas/
infra/terraform/
tests/
unit/
contract/
```


## DynamoDB access pattern example

| Record | Partition key | Sort key |
| --- | --- | --- |
| User profile | USER#phone | PROFILE |
| Conversation | USER#phone | CONVERSATION#active |
| Application | USER#phone | APPLICATION#id |
| Message receipt | EVENT#meta_id | RECEIPT |
| Job status | JOB#id | STATUS |

Choose keys from the questions the application must answer. If reporting and multi-table transactions dominate, use Aurora PostgreSQL or RDS instead of forcing everything into DynamoDB.

## Strengths and limitations

| Strengths | Limitations |
| --- | --- |
| Little server administration, automatic scaling | Distributed execution can be harder to trace/debug |
| Good cost profile for low/irregular traffic | Cold starts and service limits must be considered |
| Queues/events isolate failures cleanly | More AWS-specific configuration and IAM policies |
|   | required |
| Each function scales independently | Poor boundaries can create too many tiny functions |
|   | and deployment complexity |

Choose this when: the system is new, webhook-driven, and traffic is low/irregular/uncertain; the team is comfortable learning AWS managed services; most operations are short and split cleanly into sync/async tasks; fast independent scaling and pay-per-use economics matter.

## 5. Traditional vs. Serverless — Head to Head

| Criterion Mental model Initial coding Local development Operations Idle cost Scaling Long tasks | Traditional backend Serverless backend One application receives/handles Events move through several requests managed services/functions Usually easier for web developers Simple at first, but IAM and integrations add setup Strong — run app and DB locally Possible, but cloud integrations need emulation or deployed tests Manage runtime, containers, AWS manages runtime/scaling; scaling, health, DB team manages functions, permissions, limits Usually pays for running capacity Usually low when idle; charged per use Configure service/task scaling Automatic per service, within quotas Natural in workers/containers Move to SQS workers; Lambda |
| --- | --- |


|   |   | duration limits apply |
| --- | --- | --- |
| Database fit | RDS + ORM workflows are natural | DynamoDB is natural; relational |
|   |   | remains possible |
| Debugging | Central logs, one process, easier to | Requires correlation IDs, structured |
|   | follow | logs, tracing |
| Portability | Container is relatively portable | More coupled to AWS service |
|   |   | contracts |
| Best fit | Existing app, steady load, complex | New event-driven app, uncertain |
|   | relational domain | traffic, small ops team |

Practical recommendation: For a new WhatsApp product, start serverless if the team is comfortable with AWS and expects irregular traffic. Keep the first version deliberately small — API Gateway, one webhook Lambda, DynamoDB, Secrets Manager, CloudWatch. Add SQS and S3 only once a real slow-job or upload journey exists.

Choose ECS Fargate when the team wants a conventional API, expects extensive relational workflows, already has a Docker app, or needs runtime behavior that doesn’t fit short event handlers. Avoid a single unmanaged EC2 server as the production target unless cost/skills/constraints require it and the reliability trade-off is accepted.

## 6. Recommended Hybrid Option

Keep the core business API in an ECS Fargate container while using serverless components for the public webhook, queues, scheduled tasks, and bursty document work.

Meta webhook → API Gateway → Lambda intake → ECS business API → RDS database → Reply worker

Why this works well: - Webhook stays small, secure, fast, independently scalable - Complex business logic and relational transactions stay in one conventional service - SQS + Lambda absorb bursts and retryable tasks without blocking users - The team can migrate modules later instead of committing to a full rewrite

Avoid accidental complexity: - Don’t introduce both RDS and DynamoDB unless each has a clear access pattern - Don’t send every request through SQS — queue only work that can be asynchronous - Don’t create one Lambda per tiny helper — group functions around coherent responsibilities - Don’t let the AI model call arbitrary URLs or write directly to databases - Don’t keep identity/financial documents longer than the business requires

## Synchronous vs. asynchronous

| Keep synchronous | Make asynchronous |
| --- | --- |
| Greeting and help | Document extraction and malware scanning |
| Product/requirement lookup | Multi-document assessment |
| Simple status check | Slow external API calls |
| Short rule-based assessment | Email or batch notifications |
| Immediate validation error | Retries after provider failure |


## 7. AI Integration That Stays Trustworthy

Treat the model as a controlled interpreter. Give it a limited tool list, require structured output, validate every field, and execute business actions only in trusted code.

Safe processing sequence: 1. Classify the message into an allowed intent 2. Extract only the fields needed for that intent 3. Validate destination, dates, identifiers, enumerated values in code 4. Call a trusted business function/API 5. Give the model only the verified result it needs to phrase a response 6. Apply output filters, length limits, and a human handoff path

Example tool contract:

```
{
"tool": "get_visa_requirements",
"arguments": {
"destination_code": "AU",
"nationality_code": "NG",
"purpose": "tourism"
}
}
```

## Controls:

| Risk Unsafe action | Hallucinated facts Prompt injection | Sensitive data leakage |   | Control Retrieve verified records; prohibit the model from inventing missing values Treat user content/documents as untrusted data; restrict tools/permissions Redact logs, minimize prompts, encrypt data, use approved model settings Require server-side authorization/confirmation for payments, submissions, deletions |
| --- | --- | --- | --- | --- |
| Model outage | Uncertain answer |   |   | Return a clear limitation and offer human review Provide deterministic fallback messages and queue retryable tasks |

## 8. Security, Privacy, and Reliability

Webhook and API security - Verify Meta webhook setup requests and validate signatures on message events - Keep tokens in Secrets Manager/Parameter Store; rotate them; never commit to Git - Use TLS, request size limits, throttling, and AWS WAF where risk justifies it - Acknowledge duplicate deliveries safely using idempotency keys

Identity documents and personal data - Use private S3 buckets with Block Public Access and encryption enabled - Issue short-lived upload/download access only to the correct application flow - Record consent, purpose, retention period, deletion status - Scan uploads, validate file type/size, quarantine suspicious objects - Never put document contents, full access tokens, or unnecessary personal details in logs

IAM and environments - Give each function/task/CI-CD workflow its own least-privilege role - Use separate dev/staging/production environments and secrets - Prefer short-lived CI/CD auth via GitHub


OpenID Connect over long-lived AWS keys - Protect production changes with reviewed Terraform plans and controlled approvals

## Reliability controls

| Failure | Design response |
| --- | --- |
| Meta retries a webhook | Idempotency record prevents duplicate application |
|   | actions |
| External model times out | Timeout quickly; retry asynchronously or return a safe |
|   | fallback |
| Worker repeatedly fails | Move message to DLQ, alert the ops team |
| Database unavailable | Fail safely, avoid partial actions, surface a retry |
|   | message |
| Bad deployment | Health checks, versioned images/functions, rollback |
| Traffic spike | Throttle intentionally, buffer async work with SQS |

## 9. Testing, Monitoring, and Deployment

## Test pyramid

| Test | What it proves |
| --- | --- |
| Unit tests | State transitions, validation, rules, formatting, failure |
|   | handling |
| Contract tests | Meta payload parsing, outbound API requests, AI |
|   | structured output, internal schemas |
| Integration tests | Database writes, S3 permissions, queue processing, |
|   | secret retrieval |
| End-to-end tests | A real test WhatsApp message produces the expected |
|   | reply and stored state |
| Security tests | Invalid signatures, replay attempts, oversized files, |
|   | unauthorized access, secret leakage |
| Load tests | Webhook latency, throttling, queue depth, database |
|   | capacity, recovery |

Useful metrics and alarms - Webhook request count, validation failures, error rate, p95 latency - Messages received, replies sent, delivery failures, duplicate events - SQS age of oldest message, queue depth, retry count, DLQ messages - Lambda errors/throttles/duration/concurrency, or ECS unhealthy task count and CPU - Database errors, latency, capacity, connection pressure - AI call latency, structured-output failures, fallback rate, cost

## CI/CD sequence

Pull request → Lint & tests → Security scan → Build package → Deploy staging → Smoke test

For production: promote an immutable container image or versioned function package, run terraform plan in review, apply through a protected workflow, smoke test, and keep a documented rollback procedure.


Infrastructure as code: Use Terraform, AWS SAM, or the AWS CDK. Keep reusable modules small, pin provider/framework versions, store remote Terraform state securely, and avoid putting secret

values in state when a reference can be used instead.

## 10. Delivery Roadmap

| Phase | Outcome | Typical effort |
| --- | --- | --- |
| 1. Discovery | Journeys, data, rules, human | 1–2 days |
|   | handoff, architecture decision |   |
| 2. First reply | Real WhatsApp message reaches | 1–3 days |
|   | AWS and gets a reply |   |
| 3. Core domain | Catalogue, requirements, pricing, | 3–5 days |
|   | rules, APIs |   |
| 4. Conversation state | Users, sessions, state machine, | 2–4 days |
|   | idempotency |   |
| 5. AI layer | Intent extraction, validated tools, | 3–5 days |
|   | fallbacks, evaluation |   |
| 6. Assessment flow | Complete multi-step journey with | 3–5 days |
|   | saved application state |   |
| 7. Documents | Private upload, metadata, | 2–4 days |
|   | validation, scanning, retention |   |
| 8. Async processing | SQS, worker, retries, DLQ, | 2–3 days |
|   | notifications |   |
| 9. Platform | IaC, CI/CD, monitoring, backups, | 4–7 days |
|   | security |   |
| 10. Hardening | End-to-end tests, edge cases, | 4–7 days |
|   | production Meta setup, fixes |   |

A working prototype: 1–2 weeks. A solid MVP for a small team: 4–6 weeks. A production-ready system: 6–10+ weeks (visa/domain rule quality, document workflows, compliance, and Meta approval affect the schedule more than the AWS setup itself).

Milestones: - Week 1 — It talks: WhatsApp → AWS → WhatsApp loop works, with logs and signature validation - Weeks 2–3 — It works: Verified catalogue, stateful conversations, assessment, application status all work end to end - Weeks 4–6 — It’s operable: Documents, queues, retries, CI/CD, monitoring, security, backups, runbooks in place

Cost guidance: Estimate rather than guess — price Meta conversations/templates, model tokens, API requests, compute duration, database capacity, storage, logs, data transfer, NAT gateways, and support. Use the AWS Pricing Calculator with expected monthly messages and peak concurrency. Serverless is often more economical at low/uneven usage; containers can be more predictable at steady usage.

## 11. Build Checklist

Product journeys and human handoff documented

Authoritative rules, prices, ownership, update process defined


Meta test app, number, access token, verification token, webhook configured

Webhook signatures and duplicate deliveries handled

Conversation states and allowed transitions explicit

AI returns structured data and cannot bypass business authorization

Secrets stored outside code; CI/CD uses short-lived credentials

Documents private, encrypted, validated, scanned, retention-governed

Slow jobs use SQS with bounded retries and a DLQ

Structured logs use correlation IDs and exclude sensitive data

Dashboards and actionable alarms exist for the main user journey

Dev, staging, production separated

Infrastructure and app deployments reproducible

Backup, restore, rollback, incident, token-rotation procedures tested

A real end-to-end WhatsApp test passes before release

## 12. Final Decision Summary

| If this is true | Choose |
| --- | --- |
| The team wants the most familiar coding/debugging | Traditional backend on ECS Fargate |
| experience |   |
| The team wants minimal server ops, expects irregular | Serverless |
| traffic |   |
| A Docker backend already exists | ECS Fargate, with SQS/Lambda where useful |
| The domain is strongly relational and query-heavy | Traditional or hybrid with PostgreSQL |
| The product is a new webhook/event-driven MVP | Serverless |
| Requirements are mixed | Hybrid: serverless intake + workers, containerized core |
|   | API |

Default recommendation for a new build: begin serverless, prove the first message loop, add an explicit state machine and verified business data, then introduce AI, documents, and queues only when the user journeys require them. Switch to a traditional or hybrid core if relational complexity, long-running work, or team familiarity makes it the safer delivery path.

## Official references

- [Meta WhatsApp Cloud API docs](https://developers.facebook.com/docs/whatsapp/cloud-api/)

- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)

- [Amazon API Gateway Developer Guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html)

- [Amazon SQS Developer Guide](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)

- [Amazon DynamoDB Developer Guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html)

- [Amazon ECS on AWS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)

- [AWS Secrets Manager User Guide](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)

- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)

Service capabilities, quotas, pricing, regional availability, and Meta requirements can change — confirm current official documentation before production deployment.

## My Two Cents


A few practical notes worth adding to this guide:

- Start narrower than even the “MVP” in Section 2. If you’re building this solo or with a small student team, get journey #1 (greeting) and #2 (enquiry) working end-to-end on the serverless path before touching assessments or applications. A webhook that reliably echoes back a reply is a bigger milestone than it looks — Meta’s verification handshake and signature validation trip people up constantly.

- Watch AWS Free Tier limits closely if this is a learning/portfolio project, not a funded one — Lambda, API Gateway, and DynamoDB free tiers are generous, but NAT gateways (mentioned in the cost guidance) are a classic silent bill-spiker if you add a VPC unnecessarily. For a webhook-only serverless MVP, you likely don’t need a VPC at all.

- Bedrock model choice matters for cost more than people expect. For simple intent classification (the visa example), a smaller/cheaper model is usually plenty — save the larger models for the “rewrite verified results into natural language” step, if you need it at all.

- The idempotency-key advice (Section 3/4) is the single most skipped step in chatbot tutorials and the one that causes the most embarrassing production bugs (double-booked applications, duplicate replies). Worth building that into the very first version rather than “adding it later.”

- If you want a faster starting point than writing all this Terraform by hand, AWS SAM or the CDK will get a serverless skeleton (API Gateway + Lambda + DynamoDB) running in an afternoon — good for validating the architecture before investing in the more disciplined Terraform setup this guide recommends for production.

Happy to turn any one of these sections — the serverless build steps, the AI safety controls, or the roadmap — into a working starter repo or Terraform skeleton if that’d be useful next.
