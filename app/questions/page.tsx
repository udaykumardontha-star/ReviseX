import type { Metadata } from "next";
import { QuestionsPageClient } from "./QuestionsPageClient";
export const metadata: Metadata = { title: "Question Bank" };
export default function QuestionsPage() { return <QuestionsPageClient />; }
