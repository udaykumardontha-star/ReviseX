import { Client } from "@upstash/qstash";

export const qstashClient = process.env.QSTASH_TOKEN
  ? new Client({ token: process.env.QSTASH_TOKEN })
  : null;
