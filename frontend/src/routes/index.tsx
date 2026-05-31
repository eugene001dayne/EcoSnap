import { createFileRoute } from "@tanstack/react-router";
import EcoSnap from "@/components/EcoSnap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EcoSnap — Know your carbon. Change your world." },
      { name: "description", content: "Log your day in 2 minutes and get personalized AI tips to live lighter." },
      { property: "og:title", content: "EcoSnap" },
      { property: "og:description", content: "Know your carbon. Change your world." },
    ],
  }),
  component: EcoSnap,
});
