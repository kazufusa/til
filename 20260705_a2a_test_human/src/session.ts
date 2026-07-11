// CLI 終了後も会話を継続できるよう、過去の会話 (contextId) をファイルに永続化する。
// サーバー側の履歴は contextId をキーに残っているので、同じ contextId で
// message/send すれば会話が続く。CLI 起動時にこの一覧から選んで再開する。

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SESSIONS_FILE = join(import.meta.dir, "..", ".a2a-sessions.json");
const MAX_SESSIONS = 20;

export interface SessionEntry {
  contextId: string;
  baseUrl: string;
  // 会話の最初の発言。履歴一覧で人間が会話を見分けるためのタイトル
  title: string;
  updatedAt: string;
}

export function loadSessions(baseUrl: string): SessionEntry[] {
  if (!existsSync(SESSIONS_FILE)) return [];
  try {
    const all: SessionEntry[] = JSON.parse(
      readFileSync(SESSIONS_FILE, "utf8"),
    );
    return all
      .filter((s) => s.baseUrl === baseUrl)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function upsertSession(
  baseUrl: string,
  contextId: string,
  firstMessage: string,
): void {
  let all: SessionEntry[] = [];
  if (existsSync(SESSIONS_FILE)) {
    try {
      all = JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
    } catch {
      all = [];
    }
  }

  const now = new Date().toISOString();
  const existing = all.find((s) => s.contextId === contextId);
  if (existing) {
    existing.updatedAt = now;
  } else {
    all.push({
      contextId,
      baseUrl,
      title: firstMessage.slice(0, 40),
      updatedAt: now,
    });
  }

  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeFileSync(SESSIONS_FILE, JSON.stringify(all.slice(0, MAX_SESSIONS), null, 2));
}
