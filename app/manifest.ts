import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jules DeepDive",
    short_name: "DeepDive",
    description: "A focused dashboard for Jules coding-agent sessions.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#2d82f6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
