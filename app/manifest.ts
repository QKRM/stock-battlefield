import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Korea Stock Battlefield",
    short_name: "Stock Battlefield",
    description: "SK하이닉스와 삼성전자의 실시간 호가 전장",
    start_url: "/",
    display: "standalone",
    background_color: "#050606",
    theme_color: "#050606",
    lang: "ko",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
