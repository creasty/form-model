import type { AppProps } from "next/app";
import "@/helpers/picocss-custom.css";
import "@/helpers/example-layout.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
