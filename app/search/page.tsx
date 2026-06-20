import type { Metadata } from "next";
import { SearchPageClient } from "./SearchPageClient";

export const metadata: Metadata = {
  title: "Search",
  description: "Search across all questions, topics, and revision notes in ReviseX.",
};

export default function SearchPage() {
  return <SearchPageClient />;
}
