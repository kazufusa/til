import express from "express";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { agentCard } from "./card";
import { LlmChatExecutor } from "./executor";
import { A2A_BASE_URL, A2A_PORT, LLM_BASE_URL, LLM_MODEL } from "./config";

const requestHandler = new DefaultRequestHandler(
  agentCard,
  new InMemoryTaskStore(),
  new LlmChatExecutor(),
);

const app = new A2AExpressApp(requestHandler).setupRoutes(express());

app.listen(A2A_PORT, () => {
  console.log(`A2A server    : ${A2A_BASE_URL}`);
  console.log(`Agent card    : ${A2A_BASE_URL}/.well-known/agent-card.json`);
  console.log(`LLM backend   : ${LLM_BASE_URL} (model: ${LLM_MODEL})`);
});
