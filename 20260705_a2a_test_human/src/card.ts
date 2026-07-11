import type { AgentCard } from "@a2a-js/sdk";
import { A2A_BASE_URL } from "./config";

export const agentCard: AgentCard = {
  protocolVersion: "0.3.0",
  name: "Local Chat Agent",
  description: "llamafile 上のローカルLLMと会話するA2Aエージェント",
  url: A2A_BASE_URL,
  preferredTransport: "JSONRPC",
  version: "0.1.0",
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "chat",
      name: "Chat",
      description: "自由対話。contextId で会話を継続できる。",
      tags: ["chat", "conversation"],
      examples: ["こんにちは", "TypeScriptのジェネリクスを説明して"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
};
