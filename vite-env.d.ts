/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY?: string;
    GEMINI_API_KEY?: string;
  }
}
