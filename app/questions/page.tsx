import type { Metadata } from "next";
import { QuestionsPageClient } from "./QuestionsPageClient";
export const metadata: Metadata = { title: "Question Bank" };
export default function QuestionsPage({ searchParams }: { searchParams: { q?: string } }) { 
  return <QuestionsPageClient initialQ={searchParams.q} />; 
}
