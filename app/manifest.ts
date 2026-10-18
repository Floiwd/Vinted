import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vinted COO · Private Inventory Desk",
    short_name: "Vinted COO",
    description: "Cockpit privé de sourcing, d'arbitrage et de préparation des annonces.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b0b",
    theme_color: "#090b0b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}