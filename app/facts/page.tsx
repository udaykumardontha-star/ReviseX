import type { Metadata } from "next";
import { DailyFactsClient } from "./DailyFactsClient";

export const metadata: Metadata = {
  title: "Daily Facts | ReviseX",
  description: "Learn something new every day.",
};

export default function FactsPage() {
  return <DailyFactsClient />;
}
