import type { Metadata } from "next";
import { HomeClient } from "./HomeClient";

export const metadata: Metadata = {
  title: "Search | ReviseX",
  description: "Search your questions, topics, and notes.",
};

export default function Home() {
  return <HomeClient />;
}
