import type { Metadata } from "next";
import { QuestionsPageClient } from "./QuestionsPageClient";
export const metadata: Metadata = { title: "Question Bank" };
export default async function QuestionsPage(props: { searchParams: Promise<{ q?: string }> }) {
  const sp = await props.searchParams;
  return <QuestionsPageClient {...(sp.q && { initialQ: sp.q })} />;
}
